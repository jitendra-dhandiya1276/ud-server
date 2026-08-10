import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import fs from 'fs';
import path from 'path';
import { getImageUrl } from '../../../utils/upload';
import { checkVideoResolution, extractPoster, optimizeVideoForWeb } from '../../../utils/video';


/**
 * Resolve videoUrl / thumbnail from either an uploaded file or a pasted URL.
 * A file always wins over a URL typed in the same submission.
 *
 * Booleans and numbers arrive as strings when the request is multipart, so they
 * are coerced here rather than trusted as-is.
 */
const resolveMedia = async (req: Request) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const videoFile = files?.video?.[0];
  const thumbFile = files?.thumbnail?.[0];

  const body = req.body as Record<string, any>;
  const bool = (v: any) =>
    v === undefined ? undefined : v === true || v === 'true';

  let videoUrl = videoFile ? getImageUrl(videoFile.path) : body.videoUrl;
  let thumbnail = thumbFile ? getImageUrl(thumbFile.path) : body.thumbnail;

  if (videoFile) {
    // A reel tile is 240px wide at 3x DPR, so anything under 720px is stretched
    // and looks soft — the same failure mode as undersized product photos.
    const check = await checkVideoResolution(videoFile.path);
    if (!check.ok) {
      await fs.promises.unlink(videoFile.path).catch(() => {});
      if (thumbFile) await fs.promises.unlink(thumbFile.path).catch(() => {});
      return { error: check.message };
    }

    // Re-encode for delivery. The original is 1080x1920 and can be tens of MB;
    // the tile is 240px wide, so serving the source means downloading ~20x the
    // pixels anyone can see and stalling on playback. The optimised rendition
    // replaces it, and the source is removed once the encode succeeds.
    const webPath = videoFile.path.replace(/\.[^.]+$/, '-web.mp4');
    const optimised = await optimizeVideoForWeb(videoFile.path, webPath);
    const playablePath = optimised ?? videoFile.path;
    if (optimised && optimised !== videoFile.path) {
      await fs.promises.unlink(videoFile.path).catch(() => {});
    }
    videoUrl = getImageUrl(playablePath);

    // No poster supplied: pull one from the video itself so the tile shows a
    // sharp frame before playback starts and the admin uploads only one file.
    if (!thumbFile && !body.thumbnail) {
      const posterPath = playablePath.replace(/\.[^.]+$/, '-poster.jpg');
      const made = await extractPoster(playablePath, posterPath);
      if (made) thumbnail = getImageUrl(made);
    }
  }

  return {
    videoUrl,
    thumbnail,
    isActive: bool(body.isActive),
    sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
  };
};

export class InstagramReelsController {
  // ── Public: get active reels for homepage ─────────────────────
  async getActive(req: Request, res: Response) {
    try {
      // A reel is only displayable if it has its own video — that is what the
      // tile plays. Rows created before the video became mandatory would
      // otherwise render as empty black tiles on the homepage, so they are
      // withheld from the storefront rather than shown broken. The admin
      // listing still returns everything so they can be fixed or removed.
      const reels = await prisma.instagramReel.findMany({
        where: { isActive: true, videoUrl: { not: null } },
        orderBy: { sortOrder: 'asc' },
      });
      res.json({ success: true, data: reels });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to fetch reels' });
    }
  }

  // ── Admin: get all reels ───────────────────────────────────────
  async getAll(req: Request, res: Response) {
    try {
      const reels = await prisma.instagramReel.findMany({
        orderBy: { sortOrder: 'asc' },
      });
      res.json({ success: true, data: reels });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to fetch reels' });
    }
  }

  // ── Admin: create reel ─────────────────────────────────────────
  async create(req: Request, res: Response) {
    try {
      const { title, caption, reelUrl } = req.body;
      const media = await resolveMedia(req);
      if ('error' in media && media.error) {
        return res.status(400).json({ success: false, message: media.error });
      }
      // The video IS the reel now — the Instagram embed cannot be styled into
      // the tile, so a reel without its own video has nothing to play.
      if (!media.videoUrl) {
        return res.status(400).json({ success: false, message: 'A video file is required.' });
      }
      const reel = await prisma.instagramReel.create({
        data: {
          title: title || null,
          caption: caption || null,
          reelUrl: reelUrl || '',
          videoUrl: media.videoUrl || null,
          thumbnail: media.thumbnail || null,
          isActive: media.isActive !== false,
          sortOrder: media.sortOrder ?? 0,
        },
      });
      res.status(201).json({ success: true, data: reel });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to create reel' });
    }
  }

  // ── Admin: update reel ─────────────────────────────────────────
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { title, caption, reelUrl } = req.body;
      const media = await resolveMedia(req);
      if ('error' in media && media.error) {
        return res.status(400).json({ success: false, message: media.error });
      }
      const reel = await prisma.instagramReel.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(caption !== undefined && { caption }),
          ...(reelUrl !== undefined && { reelUrl }),
          ...(media.videoUrl !== undefined && { videoUrl: media.videoUrl || null }),
          ...(media.thumbnail !== undefined && { thumbnail: media.thumbnail || null }),
          ...(media.isActive !== undefined && { isActive: media.isActive }),
          ...(media.sortOrder !== undefined && { sortOrder: media.sortOrder }),
        },
      });
      res.json({ success: true, data: reel });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to update reel' });
    }
  }

  // ── Admin: delete reel ─────────────────────────────────────────
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.instagramReel.delete({ where: { id } });
      res.json({ success: true, message: 'Reel deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to delete reel' });
    }
  }

  // ── Admin: bulk reorder ────────────────────────────────────────
  async reorder(req: Request, res: Response) {
    try {
      const { order }: { order: { id: string; sortOrder: number }[] } = req.body;
      await prisma.$transaction(
        order.map(({ id, sortOrder }) =>
          prisma.instagramReel.update({ where: { id }, data: { sortOrder } })
        )
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to reorder reels' });
    }
  }
}

export default new InstagramReelsController();

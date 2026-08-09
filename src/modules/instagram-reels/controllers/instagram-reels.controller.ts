import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import { getImageUrl } from '../../../utils/upload';


/**
 * Resolve videoUrl / thumbnail from either an uploaded file or a pasted URL.
 * A file always wins over a URL typed in the same submission.
 *
 * Booleans and numbers arrive as strings when the request is multipart, so they
 * are coerced here rather than trusted as-is.
 */
const resolveMedia = (req: Request) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const videoFile = files?.video?.[0];
  const thumbFile = files?.thumbnail?.[0];

  const body = req.body as Record<string, any>;
  const bool = (v: any) =>
    v === undefined ? undefined : v === true || v === 'true';

  return {
    videoUrl: videoFile ? getImageUrl(videoFile.path) : body.videoUrl,
    thumbnail: thumbFile ? getImageUrl(thumbFile.path) : body.thumbnail,
    isActive: bool(body.isActive),
    sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
  };
};

export class InstagramReelsController {
  // ── Public: get active reels for homepage ─────────────────────
  async getActive(req: Request, res: Response) {
    try {
      const reels = await prisma.instagramReel.findMany({
        where: { isActive: true },
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
      if (!reelUrl) {
        return res.status(400).json({ success: false, message: 'reelUrl is required' });
      }
      const media = resolveMedia(req);
      const reel = await prisma.instagramReel.create({
        data: {
          title: title || null,
          caption: caption || null,
          reelUrl,
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
      const media = resolveMedia(req);
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

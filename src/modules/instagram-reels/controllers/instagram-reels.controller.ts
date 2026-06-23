import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';

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
      const { title, caption, reelUrl, videoUrl, thumbnail, isActive, sortOrder } = req.body;
      if (!reelUrl) {
        return res.status(400).json({ success: false, message: 'reelUrl is required' });
      }
      const reel = await prisma.instagramReel.create({
        data: {
          title: title || null,
          caption: caption || null,
          reelUrl,
          videoUrl: videoUrl || null,
          thumbnail: thumbnail || null,
          isActive: isActive !== false,
          sortOrder: sortOrder ?? 0,
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
      const { title, caption, reelUrl, videoUrl, thumbnail, isActive, sortOrder } = req.body;
      const reel = await prisma.instagramReel.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(caption !== undefined && { caption }),
          ...(reelUrl !== undefined && { reelUrl }),
          ...(videoUrl !== undefined && { videoUrl }),
          ...(thumbnail !== undefined && { thumbnail }),
          ...(isActive !== undefined && { isActive }),
          ...(sortOrder !== undefined && { sortOrder }),
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

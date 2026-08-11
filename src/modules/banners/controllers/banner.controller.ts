import { Request, Response } from 'express';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../config/prisma';
import { sendSuccess, sendPaginated } from '../../../utils/response';
import { getImageUrl } from '../../../utils/upload';
import { paginationParams } from '../../../utils/slugify';

// Fixed hero banner resolution

export class BannerController {
  async getByType(req: Request, res: Response) {
    const { type } = req.params;
    const { gender } = req.query as Record<string, string>;

    const where: any = {
      type: type.toUpperCase() as any,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    };

    // Filter by gender: show banners targeted at this gender + ALL
    if (gender && gender.toUpperCase() !== 'ALL') {
      where.gender = { in: [gender.toUpperCase(), 'ALL'] };
    }

    const banners = await prisma.banner.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
    return sendSuccess(res, banners, 'Banners fetched');
  }

  async getAll(req: Request, res: Response) {
    const { type, isActive, page, limit, search } = req.query as Record<string, string>;
    const where: any = {};
    if (type) where.type = type.toUpperCase();
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) where.title = { contains: search };

    const { page: p, limit: l, skip } = paginationParams(page, limit);
    const [data, total] = await Promise.all([
      prisma.banner.findMany({ where, orderBy: { sortOrder: 'asc' }, skip, take: l }),
      prisma.banner.count({ where }),
    ]);
    return sendPaginated(res, data, total, p, l, 'Banners fetched');
  }

  /**
   * Store the banner as a high-quality master.
   *
   * This used to hard-crop every hero to 1440x560 and re-encode it to WebP q85,
   * deleting the original. Two problems came out of that:
   *
   *   - 1440px is the master ceiling, so a 1440px-wide viewport at 2x DPR (2880
   *     needed) got an upscale. Requesting 1920w or 2560w returned the same
   *     bytes as 1440w because there were no more pixels to give. Heroes were
   *     soft on every retina screen.
   *   - The WebP pass is lossy, and /img then encodes AVIF from it. Compressing
   *     twice throws away detail that the second pass cannot recover.
   *
   * The master is now kept at its original quality and format, bounded only by
   * a sane pixel ceiling so a 50-megapixel upload cannot sit on disk forever.
   * Delivery sizing is left entirely to the derivative pipeline, which already
   * serves AVIF matched to the viewport — the storefront crops with CSS
   * object-fit, so the fixed server-side crop bought nothing.
   */
  private async processImage(file: Express.Multer.File, _type?: string): Promise<string> {
    const inputBuffer = fs.readFileSync(file.path);
    const meta = await sharp(inputBuffer).metadata();

    // Above this there is no viewport that benefits, only disk and encode time.
    const MASTER_MAX_WIDTH = 3840;

    if (meta.width && meta.width > MASTER_MAX_WIDTH) {
      const base = path.join(path.dirname(file.path), path.basename(file.path, path.extname(file.path)));
      const outPath = `${base}-master.jpg`;
      await sharp(inputBuffer)
        .rotate()
        .resize({ width: MASTER_MAX_WIDTH, withoutEnlargement: true })
        .withMetadata()
        // Near-lossless: this is an archival master, not what visitors receive.
        .jpeg({ quality: 95, mozjpeg: true })
        .toFile(outPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return getImageUrl(outPath);
    }

    // Already a sensible size — keep exactly what was uploaded.
    return getImageUrl(file.path);
  }

  private mapBody(body: any) {
    const data: any = { ...body };
    if (data.linkUrl !== undefined) { data.link = data.linkUrl; delete data.linkUrl; }
    if (data.buttonText !== undefined) { data.ctaText = data.buttonText; delete data.buttonText; }
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.sortOrder !== undefined) data.sortOrder = parseInt(data.sortOrder, 10) || 0;
    if (data.gender !== undefined) data.gender = String(data.gender).toUpperCase();
    return data;
  }

  async create(req: Request, res: Response) {
    const data = this.mapBody(req.body);
    if (req.file) data.image = await this.processImage(req.file, data.type);
    const banner = await prisma.banner.create({ data });
    return sendSuccess(res, banner, 'Banner created', 201);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = this.mapBody(req.body);
    if (req.file) data.image = await this.processImage(req.file, data.type);
    const banner = await prisma.banner.update({ where: { id }, data });
    return sendSuccess(res, banner, 'Banner updated');
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await prisma.banner.delete({ where: { id } });
    return sendSuccess(res, null, 'Banner deleted');
  }

  async reorder(req: Request, res: Response) {
    const { items } = req.body;
    await Promise.all(
      items.map((item: { id: string; sortOrder: number }) =>
        prisma.banner.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })
      )
    );
    return sendSuccess(res, null, 'Order updated');
  }
}

export const bannerController = new BannerController();

import { Request, Response } from 'express';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../config/prisma';
import { sendSuccess, sendPaginated } from '../../../utils/response';
import { getImageUrl } from '../../../utils/upload';
import { paginationParams } from '../../../utils/slugify';

// Fixed hero banner resolution
const HERO_W = 1440;
const HERO_H = 560;

export class BannerController {
  async getByType(req: Request, res: Response) {
    const { type } = req.params;
    const banners = await prisma.banner.findMany({
      where: {
        type: type.toUpperCase() as any,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
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

  private async processImage(file: Express.Multer.File, type?: string): Promise<string> {
    const isHero = !type || type.toUpperCase() === 'HERO';
    const base = path.join(path.dirname(file.path), path.basename(file.path, path.extname(file.path)));
    const outPath = `${base}-p.webp`;

    // Read into buffer first so Sharp releases the file handle before we delete it (Windows EBUSY fix)
    const inputBuffer = fs.readFileSync(file.path);
    const pipeline = sharp(inputBuffer);
    if (isHero) {
      pipeline.resize(HERO_W, HERO_H, { fit: 'cover', position: 'centre' });
    }
    await pipeline.webp({ quality: 85 }).toFile(outPath);

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    return getImageUrl(outPath);
  }

  private mapBody(body: any) {
    const data: any = { ...body };
    if (data.linkUrl !== undefined) { data.link = data.linkUrl; delete data.linkUrl; }
    if (data.buttonText !== undefined) { data.ctaText = data.buttonText; delete data.buttonText; }
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.sortOrder !== undefined) data.sortOrder = parseInt(data.sortOrder, 10) || 0;
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

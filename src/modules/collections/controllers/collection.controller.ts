import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import { sendSuccess, sendError, sendPaginated } from '../../../utils/response';
import { createSlug, paginationParams } from '../../../utils/slugify';
import { getImageUrl } from '../../../utils/upload';

export class CollectionController {
  async getAll(req: Request, res: Response) {
    const { page, limit, search } = req.query as Record<string, string>;

    if (page === undefined) {
      const collections = await prisma.collection.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return sendSuccess(res, collections, 'Collections fetched');
    }

    const where: any = {};
    if (search) where.name = { contains: search };

    const { page: p, limit: l, skip } = paginationParams(page, limit);
    const [data, total] = await Promise.all([
      prisma.collection.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { sortOrder: 'asc' },
        skip,
        take: l,
      }),
      prisma.collection.count({ where }),
    ]);
    return sendPaginated(res, data, total, p, l, 'Collections fetched');
  }

  async getBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const collection = await prisma.collection.findUnique({
      where: { slug },
      include: { _count: { select: { products: true } } },
    });
    if (!collection) return sendError(res, 'Collection not found', 404);
    return sendSuccess(res, collection, 'Collection fetched');
  }

  async create(req: Request, res: Response) {
    const file = req.file;
    const data: any = { ...req.body };
    if (!data.slug) data.slug = createSlug(data.name);
    if (file) data.image = getImageUrl(file.path);
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.isFeatured !== undefined) data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
    if (data.sortOrder !== undefined) data.sortOrder = parseInt(data.sortOrder, 10);
    const collection = await prisma.collection.create({ data });
    return sendSuccess(res, collection, 'Collection created', 201);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const file = req.file;
    const data: any = { ...req.body };
    if (file) data.image = getImageUrl(file.path);
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.isFeatured !== undefined) data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
    if (data.sortOrder !== undefined) data.sortOrder = parseInt(data.sortOrder, 10);
    const collection = await prisma.collection.update({ where: { id }, data });
    return sendSuccess(res, collection, 'Collection updated');
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await prisma.collection.delete({ where: { id } });
    return sendSuccess(res, null, 'Collection deleted');
  }
}

export const collectionController = new CollectionController();

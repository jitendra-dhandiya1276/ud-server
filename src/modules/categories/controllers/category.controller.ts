import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import { sendSuccess, sendError, sendPaginated } from '../../../utils/response';
import { createSlug, paginationParams } from '../../../utils/slugify';
import { getImageUrl } from '../../../utils/upload';
import { AppError } from '../../../middlewares/error.middleware';

export class CategoryController {
  async getAll(req: Request, res: Response) {
    const { parentOnly, withProducts, page, limit, search } = req.query as Record<string, string>;

    // Public storefront call (no page param) → return all active, flat list
    if (page === undefined) {
      const where: any = { isActive: true, deletedAt: null };
      if (parentOnly === 'true') where.parentId = null;
      if (search) where.name = { contains: search };

      const categories = await prisma.category.findMany({
        where,
        include: {
          children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          ...(withProducts === 'true' && {
            products: {
              where: { isActive: true, deletedAt: null },
              take: 4,
              include: { images: { where: { isPrimary: true }, take: 1 } },
            },
          }),
          _count: { select: { products: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });
      return sendSuccess(res, categories, 'Categories fetched');
    }

    // Admin paginated call
    const { page: p, limit: l, skip } = paginationParams(page, limit);
    const where: any = { deletedAt: null };
    if (search) where.name = { contains: search };

    const [data, total] = await Promise.all([
      prisma.category.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { sortOrder: 'asc' },
        skip,
        take: l,
      }),
      prisma.category.count({ where }),
    ]);

    return sendPaginated(res, data, total, p, l, 'Categories fetched');
  }

  async getBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    const category = await prisma.category.findFirst({
      where: { slug, isActive: true },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true } },
      },
    });
    if (!category) return sendError(res, 'Category not found', 404);
    return sendSuccess(res, category, 'Category fetched');
  }

  private mapBody(body: any, file?: Express.Multer.File) {
    const data: any = { ...body };
    if (file) data.image = getImageUrl(file.path);
    if (data.metaDescription !== undefined) { data.metaDesc = data.metaDescription; delete data.metaDescription; }
    if (data.isActive !== undefined) data.isActive = data.isActive === 'true' || data.isActive === true;
    if (data.isFeatured !== undefined) data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
    if (data.sortOrder !== undefined) data.sortOrder = parseInt(data.sortOrder, 10) || 0;
    return data;
  }

  async create(req: Request, res: Response) {
    const data = this.mapBody(req.body, req.file);
    if (!data.slug) data.slug = createSlug(data.name);
    const category = await prisma.category.create({ data });
    return sendSuccess(res, category, 'Category created', 201);
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new AppError('Category not found', 404);
    const data = this.mapBody(req.body, req.file);
    const category = await prisma.category.update({ where: { id }, data });
    return sendSuccess(res, category, 'Category updated');
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return sendSuccess(res, null, 'Category deleted');
  }

  async getFeatured(req: Request, res: Response) {
    const { limit } = req.query;
    const take = Math.min(50, parseInt(String(limit || 12), 10));
    const categories = await prisma.category.findMany({
      where: { isActive: true, isFeatured: true, parentId: null, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      take,
      include: { _count: { select: { products: true } } },
    });
    return sendSuccess(res, categories, 'Featured categories');
  }
}

export const categoryController = new CategoryController();

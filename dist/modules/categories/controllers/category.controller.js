"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryController = exports.CategoryController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
const upload_1 = require("../../../utils/upload");
const error_middleware_1 = require("../../../middlewares/error.middleware");
class CategoryController {
    async getAll(req, res) {
        const { parentOnly, withProducts, page, limit, search } = req.query;
        // Public storefront call (no page param) → return all active, flat list
        if (page === undefined) {
            const where = { isActive: true, deletedAt: null };
            if (parentOnly === 'true')
                where.parentId = null;
            if (search)
                where.name = { contains: search };
            const categories = await prisma_1.prisma.category.findMany({
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
            return (0, response_1.sendSuccess)(res, categories, 'Categories fetched');
        }
        // Admin paginated call
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page, limit);
        const where = { deletedAt: null };
        if (search)
            where.name = { contains: search };
        const [data, total] = await Promise.all([
            prisma_1.prisma.category.findMany({
                where,
                include: {
                    parent: { select: { id: true, name: true } },
                    _count: { select: { products: true } },
                },
                orderBy: { sortOrder: 'asc' },
                skip,
                take: l,
            }),
            prisma_1.prisma.category.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, data, total, p, l, 'Categories fetched');
    }
    // Lightweight hierarchical nav menu for the storefront
    async getNavMenu(req, res) {
        const categories = await prisma_1.prisma.category.findMany({
            where: { isActive: true, showInNav: true, parentId: null, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                slug: true,
                image: true,
                children: {
                    where: { isActive: true },
                    orderBy: { sortOrder: 'asc' },
                    select: { id: true, name: true, slug: true },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, categories, 'Nav menu fetched');
    }
    async getBySlug(req, res) {
        const { slug } = req.params;
        const category = await prisma_1.prisma.category.findFirst({
            where: { slug, isActive: true },
            include: {
                children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
                parent: { select: { id: true, name: true, slug: true } },
                _count: { select: { products: true } },
            },
        });
        if (!category)
            return (0, response_1.sendError)(res, 'Category not found', 404);
        return (0, response_1.sendSuccess)(res, category, 'Category fetched');
    }
    // Returns all top-level (parent) categories for dropdowns
    async getParents(req, res) {
        const categories = await prisma_1.prisma.category.findMany({
            where: { parentId: null, isActive: true, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, slug: true },
        });
        return (0, response_1.sendSuccess)(res, categories, 'Parent categories');
    }
    // Home page categories — only showOnHome=true, optional gender filter
    async getHomeCategories(req, res) {
        const { gender } = req.query;
        const where = { isActive: true, showOnHome: true, deletedAt: null };
        if (gender && gender !== 'ALL') {
            where.OR = [{ gender }, { gender: null }];
        }
        const categories = await prisma_1.prisma.category.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true, name: true, slug: true, image: true, gender: true,
                _count: { select: { products: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, categories, 'Home categories fetched');
    }
    mapBody(body, file) {
        const data = { ...body };
        if (file)
            data.image = (0, upload_1.getImageUrl)(file.path);
        if (data.metaDescription !== undefined) {
            data.metaDesc = data.metaDescription;
            delete data.metaDescription;
        }
        if (data.isActive !== undefined)
            data.isActive = data.isActive === 'true' || data.isActive === true;
        if (data.isFeatured !== undefined)
            data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
        if (data.showInNav !== undefined)
            data.showInNav = data.showInNav === 'true' || data.showInNav === true;
        if (data.showOnHome !== undefined)
            data.showOnHome = data.showOnHome === 'true' || data.showOnHome === true;
        if (data.sortOrder !== undefined)
            data.sortOrder = parseInt(data.sortOrder, 10) || 0;
        if (data.gender !== undefined)
            data.gender = data.gender || null;
        // parentId: empty string → null
        if (data.parentId !== undefined)
            data.parentId = data.parentId || null;
        return data;
    }
    async create(req, res) {
        const data = this.mapBody(req.body, req.file);
        if (!data.slug)
            data.slug = (0, slugify_1.createSlug)(data.name);
        const category = await prisma_1.prisma.category.create({ data });
        return (0, response_1.sendSuccess)(res, category, 'Category created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const existing = await prisma_1.prisma.category.findUnique({ where: { id } });
        if (!existing)
            throw new error_middleware_1.AppError('Category not found', 404);
        const data = this.mapBody(req.body, req.file);
        const category = await prisma_1.prisma.category.update({ where: { id }, data });
        return (0, response_1.sendSuccess)(res, category, 'Category updated');
    }
    async delete(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
        return (0, response_1.sendSuccess)(res, null, 'Category deleted');
    }
    async getFeatured(req, res) {
        const { limit } = req.query;
        const take = Math.min(50, parseInt(String(limit || 12), 10));
        const categories = await prisma_1.prisma.category.findMany({
            where: { isActive: true, isFeatured: true, parentId: null, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            take,
            include: { _count: { select: { products: true } } },
        });
        return (0, response_1.sendSuccess)(res, categories, 'Featured categories');
    }
}
exports.CategoryController = CategoryController;
exports.categoryController = new CategoryController();

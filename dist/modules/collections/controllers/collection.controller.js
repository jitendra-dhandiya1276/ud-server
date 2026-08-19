"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionController = exports.CollectionController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
const upload_1 = require("../../../utils/upload");
class CollectionController {
    async getAll(req, res) {
        const { page, limit, search } = req.query;
        if (page === undefined) {
            const collections = await prisma_1.prisma.collection.findMany({
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
                include: { _count: { select: { products: true } } },
            });
            return (0, response_1.sendSuccess)(res, collections, 'Collections fetched');
        }
        const where = {};
        if (search)
            where.name = { contains: search };
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page, limit);
        const [data, total] = await Promise.all([
            prisma_1.prisma.collection.findMany({
                where,
                include: { _count: { select: { products: true } } },
                orderBy: { sortOrder: 'asc' },
                skip,
                take: l,
            }),
            prisma_1.prisma.collection.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, data, total, p, l, 'Collections fetched');
    }
    async getBySlug(req, res) {
        const { slug } = req.params;
        const collection = await prisma_1.prisma.collection.findUnique({
            where: { slug },
            include: { _count: { select: { products: true } } },
        });
        if (!collection)
            return (0, response_1.sendError)(res, 'Collection not found', 404);
        return (0, response_1.sendSuccess)(res, collection, 'Collection fetched');
    }
    async create(req, res) {
        const file = req.file;
        const data = { ...req.body };
        if (!data.slug)
            data.slug = (0, slugify_1.createSlug)(data.name);
        if (file)
            data.image = (0, upload_1.getImageUrl)(file.path);
        if (data.isActive !== undefined)
            data.isActive = data.isActive === 'true' || data.isActive === true;
        if (data.isFeatured !== undefined)
            data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
        if (data.sortOrder !== undefined)
            data.sortOrder = parseInt(data.sortOrder, 10);
        const collection = await prisma_1.prisma.collection.create({ data });
        return (0, response_1.sendSuccess)(res, collection, 'Collection created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const file = req.file;
        const data = { ...req.body };
        if (file)
            data.image = (0, upload_1.getImageUrl)(file.path);
        if (data.isActive !== undefined)
            data.isActive = data.isActive === 'true' || data.isActive === true;
        if (data.isFeatured !== undefined)
            data.isFeatured = data.isFeatured === 'true' || data.isFeatured === true;
        if (data.sortOrder !== undefined)
            data.sortOrder = parseInt(data.sortOrder, 10);
        const collection = await prisma_1.prisma.collection.update({ where: { id }, data });
        return (0, response_1.sendSuccess)(res, collection, 'Collection updated');
    }
    async delete(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.collection.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Collection deleted');
    }
    async getProducts(req, res) {
        const { id } = req.params;
        const { page, limit, search } = req.query;
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page || '1', limit || '20');
        const where = { collections: { some: { collectionId: id } }, deletedAt: null };
        if (search)
            where.name = { contains: search };
        const [products, total] = await Promise.all([
            prisma_1.prisma.product.findMany({
                where,
                skip,
                take: l,
                // A collection spans categories, so admin priority does not apply here.
                // This had no ordering at all, which meant paginating could show the
                // same product twice and skip another.
                orderBy: [{ createdAt: 'desc' }],
                select: {
                    id: true, name: true, slug: true, basePrice: true, salePrice: true, isActive: true,
                    images: { where: { isPrimary: true }, take: 1, select: { url: true } },
                    category: { select: { name: true } },
                },
            }),
            prisma_1.prisma.product.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, products, total, p, l, 'Products fetched');
    }
    async addProduct(req, res) {
        const { id } = req.params;
        const { productId } = req.body;
        if (!productId)
            return (0, response_1.sendError)(res, 'productId required', 400);
        const col = await prisma_1.prisma.collection.findUnique({ where: { id } });
        if (!col)
            return (0, response_1.sendError)(res, 'Collection not found', 404);
        const existing = await prisma_1.prisma.productCollection.findUnique({
            where: { productId_collectionId: { productId, collectionId: id } },
        });
        if (existing)
            return (0, response_1.sendSuccess)(res, existing, 'Already in collection');
        const result = await prisma_1.prisma.productCollection.create({ data: { productId, collectionId: id } });
        return (0, response_1.sendSuccess)(res, result, 'Product added', 201);
    }
    async removeProduct(req, res) {
        const { id, productId } = req.params;
        await prisma_1.prisma.productCollection.delete({
            where: { productId_collectionId: { productId, collectionId: id } },
        });
        return (0, response_1.sendSuccess)(res, null, 'Product removed');
    }
}
exports.CollectionController = CollectionController;
exports.collectionController = new CollectionController();

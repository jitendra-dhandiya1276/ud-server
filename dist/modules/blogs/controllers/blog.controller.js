"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blogController = exports.BlogController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
const upload_1 = require("../../../utils/upload");
const slugify_2 = require("../../../utils/slugify");
class BlogController {
    async getPublished(req, res) {
        const { page, limit, category } = req.query;
        const { skip } = (0, slugify_2.paginationParams)(page, limit);
        const where = { isPublished: true, deletedAt: null };
        if (category)
            where.blogCategory = { slug: category };
        const [blogs, total] = await Promise.all([
            prisma_1.prisma.blog.findMany({
                where,
                include: { blogCategory: true, tags: true },
                orderBy: { publishedAt: 'desc' },
                skip,
                take: parseInt(limit || '10'),
            }),
            prisma_1.prisma.blog.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, blogs, total, parseInt(page || '1'), parseInt(limit || '10'));
    }
    async getBySlug(req, res) {
        const { slug } = req.params;
        const blog = await prisma_1.prisma.blog.findFirst({
            where: { slug, isPublished: true, deletedAt: null },
            include: { blogCategory: true, tags: true },
        });
        if (!blog)
            return (0, response_1.sendError)(res, 'Blog not found', 404);
        await prisma_1.prisma.blog.update({ where: { id: blog.id }, data: { viewCount: { increment: 1 } } });
        return (0, response_1.sendSuccess)(res, blog, 'Blog fetched');
    }
    async create(req, res) {
        const file = req.file;
        const data = req.body;
        if (!data.slug)
            data.slug = (0, slugify_1.createSlug)(data.title);
        if (file)
            data.image = (0, upload_1.getImageUrl)(file.path);
        if (data.isPublished && !data.publishedAt)
            data.publishedAt = new Date();
        const { tags, ...blogData } = data;
        const blog = await prisma_1.prisma.blog.create({
            data: {
                ...blogData,
                tags: tags?.length ? { create: tags.map((tag) => ({ tag })) } : undefined,
            },
            include: { tags: true },
        });
        return (0, response_1.sendSuccess)(res, blog, 'Blog created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const file = req.file;
        const data = req.body;
        if (file)
            data.image = (0, upload_1.getImageUrl)(file.path);
        if (data.isPublished && !data.publishedAt)
            data.publishedAt = new Date();
        const { tags, ...blogData } = data;
        const blog = await prisma_1.prisma.blog.update({
            where: { id },
            data: {
                ...blogData,
                ...(tags && {
                    tags: {
                        deleteMany: {},
                        create: tags.map((tag) => ({ tag })),
                    },
                }),
            },
            include: { tags: true },
        });
        return (0, response_1.sendSuccess)(res, blog, 'Blog updated');
    }
    async delete(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.blog.update({ where: { id }, data: { deletedAt: new Date() } });
        return (0, response_1.sendSuccess)(res, null, 'Blog deleted');
    }
    async getAllAdmin(req, res) {
        const { page, limit } = req.query;
        const { skip } = (0, slugify_2.paginationParams)(page, limit);
        const [blogs, total] = await Promise.all([
            prisma_1.prisma.blog.findMany({
                where: { deletedAt: null },
                include: { blogCategory: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit || '20'),
            }),
            prisma_1.prisma.blog.count({ where: { deletedAt: null } }),
        ]);
        return (0, response_1.sendPaginated)(res, blogs, total, parseInt(page || '1'), parseInt(limit || '20'));
    }
    async getCategories(req, res) {
        const categories = await prisma_1.prisma.blogCategory.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { blogs: { where: { isPublished: true } } } } },
        });
        return (0, response_1.sendSuccess)(res, categories, 'Blog categories');
    }
}
exports.BlogController = BlogController;
exports.blogController = new BlogController();

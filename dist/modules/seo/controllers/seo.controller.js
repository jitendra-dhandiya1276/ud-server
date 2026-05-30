"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seoController = exports.SeoController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
class SeoController {
    async getByPage(req, res) {
        const { page } = req.params;
        const seo = await prisma_1.prisma.seoMeta.findUnique({ where: { page } });
        return (0, response_1.sendSuccess)(res, seo, 'SEO meta fetched');
    }
    async upsert(req, res) {
        const { page, ...data } = req.body;
        const seo = await prisma_1.prisma.seoMeta.upsert({
            where: { page },
            create: { page, ...data },
            update: data,
        });
        return (0, response_1.sendSuccess)(res, seo, 'SEO meta saved');
    }
    async getAll(req, res) {
        const { page, limit, search } = req.query;
        if (page === undefined) {
            const pages = await prisma_1.prisma.seoMeta.findMany({ orderBy: { page: 'asc' } });
            return (0, response_1.sendSuccess)(res, pages, 'SEO pages fetched');
        }
        const where = {};
        if (search)
            where.page = { contains: search };
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page, limit);
        const [data, total] = await Promise.all([
            prisma_1.prisma.seoMeta.findMany({ where, orderBy: { page: 'asc' }, skip, take: l }),
            prisma_1.prisma.seoMeta.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, data, total, p, l, 'SEO pages fetched');
    }
    async update(req, res) {
        const { id } = req.params;
        const seo = await prisma_1.prisma.seoMeta.update({ where: { id }, data: req.body });
        return (0, response_1.sendSuccess)(res, seo, 'SEO meta updated');
    }
    async getCmsPage(req, res) {
        const { slug } = req.params;
        const page = await prisma_1.prisma.cmsPage.findFirst({ where: { slug, isActive: true } });
        if (!page)
            return (0, response_1.sendError)(res, 'Page not found', 404);
        return (0, response_1.sendSuccess)(res, page, 'CMS page fetched');
    }
    async getAllCmsPages(req, res) {
        const pages = await prisma_1.prisma.cmsPage.findMany({ orderBy: { sortOrder: 'asc' } });
        return (0, response_1.sendSuccess)(res, pages, 'CMS pages fetched');
    }
    async upsertCmsPage(req, res) {
        const { slug, ...data } = req.body;
        const page = await prisma_1.prisma.cmsPage.upsert({
            where: { slug },
            create: { slug, ...data },
            update: data,
        });
        return (0, response_1.sendSuccess)(res, page, 'CMS page saved');
    }
}
exports.SeoController = SeoController;
exports.seoController = new SeoController();

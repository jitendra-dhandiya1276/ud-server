"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homepageController = exports.HomepageController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
class HomepageController {
    async getSections(req, res) {
        const sections = await prisma_1.prisma.homepageSection.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, sections, 'Homepage sections fetched');
    }
    async getAllSections(req, res) {
        const sections = await prisma_1.prisma.homepageSection.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, sections, 'All sections fetched');
    }
    async updateSection(req, res) {
        const { id } = req.params;
        const section = await prisma_1.prisma.homepageSection.update({
            where: { id },
            data: req.body,
        });
        return (0, response_1.sendSuccess)(res, section, 'Section updated');
    }
    async createSection(req, res) {
        const section = await prisma_1.prisma.homepageSection.create({ data: req.body });
        return (0, response_1.sendSuccess)(res, section, 'Section created', 201);
    }
    async deleteSection(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.homepageSection.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Section deleted');
    }
    async reorderSections(req, res) {
        const { items } = req.body;
        await prisma_1.prisma.$transaction(items.map(item => prisma_1.prisma.homepageSection.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })));
        return (0, response_1.sendSuccess)(res, null, 'Order updated');
    }
    async getFullHomepageData(req, res) {
        // Same gender semantics as GET /banners/:type — a banner targeted at this
        // gender, plus the ones targeted at everyone. Without this the server-
        // rendered homepage showed every banner while the client's own refetch
        // showed the filtered set, so the two disagreed until the first toggle.
        const { gender } = req.query;
        const gWhere = gender && gender.toUpperCase() !== 'ALL'
            ? { gender: { in: [gender.toUpperCase(), 'ALL'] } }
            : {};
        const [sections, heroBanners, promoBanners, testimonials, settings] = await Promise.all([
            prisma_1.prisma.homepageSection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
            prisma_1.prisma.banner.findMany({ where: { type: 'HERO', isActive: true, ...gWhere }, orderBy: { sortOrder: 'asc' } }),
            prisma_1.prisma.banner.findMany({ where: { type: 'PROMOTIONAL', isActive: true, ...gWhere }, orderBy: { sortOrder: 'asc' } }),
            prisma_1.prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
            prisma_1.prisma.setting.findMany({ where: { group: 'homepage' } }),
        ]);
        return (0, response_1.sendSuccess)(res, { sections, heroBanners, promoBanners, testimonials, settings }, 'Homepage data fetched');
    }
}
exports.HomepageController = HomepageController;
exports.homepageController = new HomepageController();

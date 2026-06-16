"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bannerController = exports.BannerController = void 0;
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const upload_1 = require("../../../utils/upload");
const slugify_1 = require("../../../utils/slugify");
// Fixed hero banner resolution
const HERO_W = 1440;
const HERO_H = 560;
class BannerController {
    async getByType(req, res) {
        const { type } = req.params;
        const { gender } = req.query;
        const where = {
            type: type.toUpperCase(),
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        };
        // Filter by gender: show banners targeted at this gender + ALL
        if (gender && gender.toUpperCase() !== 'ALL') {
            where.gender = { in: [gender.toUpperCase(), 'ALL'] };
        }
        const banners = await prisma_1.prisma.banner.findMany({
            where,
            orderBy: { sortOrder: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, banners, 'Banners fetched');
    }
    async getAll(req, res) {
        const { type, isActive, page, limit, search } = req.query;
        const where = {};
        if (type)
            where.type = type.toUpperCase();
        if (isActive !== undefined)
            where.isActive = isActive === 'true';
        if (search)
            where.title = { contains: search };
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page, limit);
        const [data, total] = await Promise.all([
            prisma_1.prisma.banner.findMany({ where, orderBy: { sortOrder: 'asc' }, skip, take: l }),
            prisma_1.prisma.banner.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, data, total, p, l, 'Banners fetched');
    }
    async processImage(file, type) {
        const isHero = !type || type.toUpperCase() === 'HERO';
        const base = path_1.default.join(path_1.default.dirname(file.path), path_1.default.basename(file.path, path_1.default.extname(file.path)));
        const outPath = `${base}-p.webp`;
        // Read into buffer first so Sharp releases the file handle before we delete it (Windows EBUSY fix)
        const inputBuffer = fs_1.default.readFileSync(file.path);
        const pipeline = (0, sharp_1.default)(inputBuffer);
        if (isHero) {
            pipeline.resize(HERO_W, HERO_H, { fit: 'cover', position: 'centre' });
        }
        await pipeline.webp({ quality: 85 }).toFile(outPath);
        if (fs_1.default.existsSync(file.path)) {
            fs_1.default.unlinkSync(file.path);
        }
        return (0, upload_1.getImageUrl)(outPath);
    }
    mapBody(body) {
        const data = { ...body };
        if (data.linkUrl !== undefined) {
            data.link = data.linkUrl;
            delete data.linkUrl;
        }
        if (data.buttonText !== undefined) {
            data.ctaText = data.buttonText;
            delete data.buttonText;
        }
        if (data.isActive !== undefined)
            data.isActive = data.isActive === 'true' || data.isActive === true;
        if (data.sortOrder !== undefined)
            data.sortOrder = parseInt(data.sortOrder, 10) || 0;
        if (data.gender !== undefined)
            data.gender = String(data.gender).toUpperCase();
        return data;
    }
    async create(req, res) {
        const data = this.mapBody(req.body);
        if (req.file)
            data.image = await this.processImage(req.file, data.type);
        const banner = await prisma_1.prisma.banner.create({ data });
        return (0, response_1.sendSuccess)(res, banner, 'Banner created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const data = this.mapBody(req.body);
        if (req.file)
            data.image = await this.processImage(req.file, data.type);
        const banner = await prisma_1.prisma.banner.update({ where: { id }, data });
        return (0, response_1.sendSuccess)(res, banner, 'Banner updated');
    }
    async delete(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.banner.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Banner deleted');
    }
    async reorder(req, res) {
        const { items } = req.body;
        await Promise.all(items.map((item) => prisma_1.prisma.banner.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })));
        return (0, response_1.sendSuccess)(res, null, 'Order updated');
    }
}
exports.BannerController = BannerController;
exports.bannerController = new BannerController();

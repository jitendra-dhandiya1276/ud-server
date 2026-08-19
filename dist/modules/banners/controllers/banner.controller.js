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
/**
 * Hero framing. These now define the ASPECT the master is cropped to, not
 * its pixel size — pinning the size to 1440 is what made retina heroes soft.
 */
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
    /**
     * Store the banner cropped to the hero framing, at full resolution.
     *
     * The original code cropped every hero to exactly 1440x560 and re-encoded it
     * to WebP q85, deleting the source. The FRAMING was right — a consistent
     * 2.57:1 hero is the design — but pinning the pixel size to 1440 made 1440px
     * the master ceiling, so a 1440px viewport at 2x DPR (2880 needed) got an
     * upscale and every retina screen saw a soft hero. Asking for 1920w or 2560w
     * returned the same bytes as 1440w because there were no more pixels.
     *
     * So the aspect is kept and the resolution is not: the image is cropped to
     * the same 1440:560 ratio the design expects, but at the source's own
     * resolution, capped at 3840 wide. A 3000px upload becomes 3000x1167 — the
     * identical framing, with 2x the detail available to the derivative pipeline.
     *
     * Mobile crops are left alone: they are portrait by definition and are
     * selected by a media query, not cropped to the desktop ratio.
     */
    async processImage(file, type) {
        const isHero = !type || type.toUpperCase() === 'HERO';
        const isMobileCrop = file.fieldname === 'mobileImage';
        const inputBuffer = fs_1.default.readFileSync(file.path);
        const meta = await (0, sharp_1.default)(inputBuffer).metadata();
        // Beyond this no viewport benefits, only disk and encode time.
        const MASTER_MAX_WIDTH = 3840;
        const needsCrop = isHero && !isMobileCrop;
        const tooWide = (meta.width ?? 0) > MASTER_MAX_WIDTH;
        if (!needsCrop && !tooWide) {
            // Nothing to do — keep exactly what was uploaded.
            return (0, upload_1.getImageUrl)(file.path);
        }
        const base = path_1.default.join(path_1.default.dirname(file.path), path_1.default.basename(file.path, path_1.default.extname(file.path)));
        const outPath = `${base}-master.jpg`;
        let pipeline = (0, sharp_1.default)(inputBuffer).rotate();
        if (needsCrop) {
            // Same 1440:560 framing as before, at whatever resolution the source
            // supports (bounded above). withoutEnlargement keeps a small upload from
            // being inflated into a fake.
            const targetWidth = Math.min(meta.width ?? HERO_W, MASTER_MAX_WIDTH);
            const targetHeight = Math.round(targetWidth * (HERO_H / HERO_W));
            pipeline = pipeline.resize(targetWidth, targetHeight, {
                fit: 'cover',
                position: 'centre',
                withoutEnlargement: true,
            });
        }
        else if (tooWide) {
            pipeline = pipeline.resize({ width: MASTER_MAX_WIDTH, withoutEnlargement: true });
        }
        await pipeline
            .withMetadata()
            // Near-lossless: this is the archival master, not what visitors receive.
            .jpeg({ quality: 95, mozjpeg: true })
            .toFile(outPath);
        if (fs_1.default.existsSync(file.path))
            fs_1.default.unlinkSync(file.path);
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
        if (data.mobileImage === '')
            delete data.mobileImage;
        return data;
    }
    filesFrom(req) {
        const grouped = req.files;
        return {
            desktop: grouped?.image?.[0] ?? req.file,
            mobile: grouped?.mobileImage?.[0],
        };
    }
    async create(req, res) {
        const data = this.mapBody(req.body);
        const { desktop, mobile } = this.filesFrom(req);
        if (desktop)
            data.image = await this.processImage(desktop, data.type);
        if (mobile)
            data.mobileImage = await this.processImage(mobile, data.type);
        const banner = await prisma_1.prisma.banner.create({ data });
        return (0, response_1.sendSuccess)(res, banner, 'Banner created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const data = this.mapBody(req.body);
        const { desktop, mobile } = this.filesFrom(req);
        if (desktop)
            data.image = await this.processImage(desktop, data.type);
        if (mobile)
            data.mobileImage = await this.processImage(mobile, data.type);
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

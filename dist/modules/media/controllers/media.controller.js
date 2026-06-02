"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaController = exports.MediaController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const upload_1 = require("../../../utils/upload");
const path_1 = __importDefault(require("path"));
const env_1 = require("../../../config/env");
const slugify_1 = require("../../../utils/slugify");
class MediaController {
    async upload(req, res) {
        const files = req.files;
        const { folder = 'GENERAL', altText } = req.body;
        const media = await Promise.all(files.map(async (file) => {
            const url = (0, upload_1.getImageUrl)(file.path);
            return prisma_1.prisma.media.create({
                data: {
                    filename: file.filename,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    url,
                    folder: folder.toUpperCase(),
                    altText,
                    uploadedBy: req.user?.userId,
                },
            });
        }));
        return (0, response_1.sendSuccess)(res, media, 'Files uploaded', 201);
    }
    async getAll(req, res) {
        const { page, limit, folder } = req.query;
        const { skip } = (0, slugify_1.paginationParams)(page, limit);
        const where = {};
        if (folder)
            where.folder = folder.toUpperCase();
        const parsedPage = parseInt(page || '1');
        const parsedLimit = parseInt(limit || '30');
        const [media, total] = await Promise.all([
            prisma_1.prisma.media.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parsedLimit }),
            prisma_1.prisma.media.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, media, total, parsedPage, parsedLimit);
    }
    async delete(req, res) {
        const { id } = req.params;
        const media = await prisma_1.prisma.media.findUnique({ where: { id } });
        if (!media)
            return (0, response_1.sendError)(res, 'Media not found', 404);
        const filePath = path_1.default.join(env_1.config.upload.path, media.folder.toLowerCase(), media.filename);
        await (0, upload_1.deleteFile)(filePath);
        await prisma_1.prisma.media.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Media deleted');
    }
}
exports.MediaController = MediaController;
exports.mediaController = new MediaController();

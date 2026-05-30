"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wishlistController = exports.WishlistController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
class WishlistController {
    async getWishlist(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const items = await prisma_1.prisma.wishlistItem.findMany({
            where: { userId: req.user.userId },
            include: {
                product: {
                    include: {
                        images: { where: { isPrimary: true }, take: 1 },
                        variants: { where: { isActive: true }, select: { size: true, color: true, stockQuantity: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, items, 'Wishlist fetched');
    }
    async toggle(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { productId } = req.body;
        const existing = await prisma_1.prisma.wishlistItem.findUnique({
            where: { userId_productId: { userId: req.user.userId, productId } },
        });
        if (existing) {
            await prisma_1.prisma.wishlistItem.delete({ where: { id: existing.id } });
            return (0, response_1.sendSuccess)(res, { inWishlist: false }, 'Removed from wishlist');
        }
        else {
            await prisma_1.prisma.wishlistItem.create({ data: { userId: req.user.userId, productId } });
            return (0, response_1.sendSuccess)(res, { inWishlist: true }, 'Added to wishlist');
        }
    }
    async check(req, res) {
        if (!req.user)
            return (0, response_1.sendSuccess)(res, { inWishlist: false }, '');
        const { productId } = req.params;
        const item = await prisma_1.prisma.wishlistItem.findUnique({
            where: { userId_productId: { userId: req.user.userId, productId } },
        });
        return (0, response_1.sendSuccess)(res, { inWishlist: !!item }, '');
    }
}
exports.WishlistController = WishlistController;
exports.wishlistController = new WishlistController();

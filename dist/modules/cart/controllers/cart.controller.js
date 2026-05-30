"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartController = exports.CartController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const error_middleware_1 = require("../../../middlewares/error.middleware");
class CartController {
    async getOrCreateCart(userId, sessionId) {
        if (!userId && !sessionId)
            throw new error_middleware_1.AppError('Cart identifier required', 400);
        const where = userId ? { userId } : { sessionId };
        let cart = await prisma_1.prisma.cart.findFirst({ where, include: { items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } }, variant: true } } } });
        if (!cart) {
            cart = await prisma_1.prisma.cart.create({
                data: userId ? { userId } : { sessionId },
                include: { items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } }, variant: true } } },
            });
        }
        return cart;
    }
    async getCart(req, res) {
        const userId = req.user?.userId;
        const sessionId = req.headers['x-session-id'];
        const cart = await this.getOrCreateCart(userId, sessionId);
        return (0, response_1.sendSuccess)(res, cart, 'Cart fetched');
    }
    async addItem(req, res) {
        const { productId, variantId, quantity = 1 } = req.body;
        const userId = req.user?.userId;
        const sessionId = req.headers['x-session-id'];
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, isActive: true, deletedAt: null },
        });
        if (!product)
            return (0, response_1.sendError)(res, 'Product not found', 404);
        let price = Number(variantId ? (await prisma_1.prisma.productVariant.findUnique({ where: { id: variantId } }))?.price || product.salePrice || product.basePrice : product.salePrice || product.basePrice);
        const cart = await this.getOrCreateCart(userId, sessionId);
        const existingItem = await prisma_1.prisma.cartItem.findFirst({
            where: { cartId: cart.id, productId, variantId: variantId || null },
        });
        if (existingItem) {
            await prisma_1.prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: existingItem.quantity + quantity },
            });
        }
        else {
            await prisma_1.prisma.cartItem.create({
                data: { cartId: cart.id, productId, variantId: variantId || null, quantity, price },
            });
        }
        const updatedCart = await prisma_1.prisma.cart.findUnique({
            where: { id: cart.id },
            include: { items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } }, variant: true } } },
        });
        return (0, response_1.sendSuccess)(res, updatedCart, 'Item added to cart');
    }
    async updateItem(req, res) {
        const { itemId } = req.params;
        const { quantity } = req.body;
        if (quantity < 1) {
            await prisma_1.prisma.cartItem.delete({ where: { id: itemId } });
        }
        else {
            await prisma_1.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
        }
        return (0, response_1.sendSuccess)(res, null, 'Cart updated');
    }
    async removeItem(req, res) {
        const { itemId } = req.params;
        await prisma_1.prisma.cartItem.delete({ where: { id: itemId } });
        return (0, response_1.sendSuccess)(res, null, 'Item removed');
    }
    async clearCart(req, res) {
        const userId = req.user?.userId;
        const sessionId = req.headers['x-session-id'];
        const where = userId ? { userId } : { sessionId };
        const cart = await prisma_1.prisma.cart.findFirst({ where });
        if (cart)
            await prisma_1.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        return (0, response_1.sendSuccess)(res, null, 'Cart cleared');
    }
    async applyCoupon(req, res) {
        const { code, cartTotal } = req.body;
        const coupon = await prisma_1.prisma.coupon.findFirst({
            where: {
                code: { equals: code },
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
                OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
            },
        });
        if (!coupon)
            return (0, response_1.sendError)(res, 'Invalid or expired coupon', 400);
        if (coupon.minOrderAmount && cartTotal < Number(coupon.minOrderAmount)) {
            return (0, response_1.sendError)(res, `Minimum order amount is ₹${coupon.minOrderAmount}`, 400);
        }
        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return (0, response_1.sendError)(res, 'Coupon usage limit reached', 400);
        }
        let discount = 0;
        if (coupon.type === 'PERCENTAGE') {
            discount = (cartTotal * Number(coupon.value)) / 100;
            if (coupon.maxDiscount)
                discount = Math.min(discount, Number(coupon.maxDiscount));
        }
        else if (coupon.type === 'FIXED') {
            discount = Math.min(Number(coupon.value), cartTotal);
        }
        else if (coupon.type === 'FREE_SHIPPING') {
            discount = 0;
        }
        return (0, response_1.sendSuccess)(res, { coupon: { code: coupon.code, type: coupon.type, discount }, discountAmount: discount }, 'Coupon applied');
    }
}
exports.CartController = CartController;
exports.cartController = new CartController();

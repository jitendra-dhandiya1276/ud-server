"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = exports.OrderService = void 0;
const prisma_1 = require("../../../config/prisma");
const error_middleware_1 = require("../../../middlewares/error.middleware");
const slugify_1 = require("../../../utils/slugify");
const slugify_2 = require("../../../utils/slugify");
class OrderService {
    async createOrder(userId, data) {
        const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        let couponDiscount = 0;
        let shippingCharge = subtotal < 999 ? 99 : 0;
        const taxAmount = subtotal * 0.18;
        const total = subtotal - couponDiscount + shippingCharge;
        const order = await prisma_1.prisma.order.create({
            data: {
                orderNumber: (0, slugify_1.generateOrderNumber)(),
                userId,
                addressId: data.addressId,
                status: 'PENDING',
                paymentStatus: data.paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
                paymentMethod: data.paymentMethod,
                subtotal,
                discount: couponDiscount,
                shippingCharge,
                taxAmount,
                total,
                couponCode: data.couponCode,
                couponDiscount,
                notes: data.notes,
                shippingAddress: data.shippingAddress,
                billingAddress: data.billingAddress || data.shippingAddress,
                items: {
                    create: data.items.map(item => ({
                        productId: item.productId,
                        variantId: item.variantId,
                        quantity: item.quantity,
                        price: item.price,
                        total: item.price * item.quantity,
                        name: '',
                    })),
                },
            },
            include: { items: true, address: true },
        });
        for (const item of data.items) {
            await prisma_1.prisma.product.update({
                where: { id: item.productId },
                data: {
                    totalSold: { increment: item.quantity },
                    stockQuantity: { decrement: item.quantity },
                },
            });
        }
        return order;
    }
    async getOrderById(id, userId) {
        const where = userId ? { id, userId } : { id };
        const order = await prisma_1.prisma.order.findFirst({
            where,
            include: {
                items: {
                    include: {
                        product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
                        variant: true,
                    },
                },
                address: true,
                payment: true,
            },
        });
        if (!order)
            throw new error_middleware_1.AppError('Order not found', 404);
        return order;
    }
    async getOrderByNumber(orderNumber) {
        const order = await prisma_1.prisma.order.findFirst({
            where: { orderNumber },
            include: {
                items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } }, variant: true } },
                address: true,
                payment: true,
            },
        });
        if (!order)
            throw new error_middleware_1.AppError('Order not found', 404);
        return order;
    }
    async getUserOrders(userId, page = 1, limit = 10) {
        const { skip } = (0, slugify_2.paginationParams)(page, limit);
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where: { userId },
                include: {
                    items: { take: 2, include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.order.count({ where: { userId } }),
        ]);
        return { orders, total, page, limit };
    }
    async getAllOrders(page = 1, limit = 20, filters) {
        const { skip } = (0, slugify_2.paginationParams)(page, limit);
        const where = {};
        if (filters?.status)
            where.status = filters.status;
        if (filters?.paymentStatus)
            where.paymentStatus = filters.paymentStatus;
        if (filters?.search) {
            where.OR = [
                { orderNumber: { contains: filters.search } },
                { user: { email: { contains: filters.search } } },
            ];
        }
        if (filters?.startDate)
            where.createdAt = { gte: new Date(filters.startDate) };
        if (filters?.endDate)
            where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                    items: { take: 1, include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.order.count({ where }),
        ]);
        return { orders, total, page, limit };
    }
    async updateOrderStatus(id, status, trackingNumber, trackingUrl) {
        return prisma_1.prisma.order.update({
            where: { id },
            data: {
                status: status,
                ...(trackingNumber && { trackingNumber }),
                ...(trackingUrl && { trackingUrl }),
                ...(status === 'DELIVERED' && { deliveryDate: new Date() }),
            },
        });
    }
    async cancelOrder(id, userId, reason) {
        const order = await prisma_1.prisma.order.findFirst({
            where: { id, userId, status: { in: ['PENDING', 'CONFIRMED'] } },
        });
        if (!order)
            throw new error_middleware_1.AppError('Order cannot be cancelled', 400);
        return prisma_1.prisma.order.update({
            where: { id },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        });
    }
}
exports.OrderService = OrderService;
exports.orderService = new OrderService();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = exports.OrderService = void 0;
const prisma_1 = require("../../../config/prisma");
const error_middleware_1 = require("../../../middlewares/error.middleware");
const slugify_1 = require("../../../utils/slugify");
const slugify_2 = require("../../../utils/slugify");
class OrderService {
    /**
     * The address stored on the order is a snapshot: the customer may edit or
     * delete the saved address later, and the order must still show where it
     * actually went. When a saved address is chosen the browser sends nothing
     * useful, so the snapshot is built here from the row itself.
     */
    async resolveShippingAddress(tx, userId, addressId, posted) {
        if (addressId) {
            const saved = await tx.address.findFirst({ where: { id: addressId, userId } });
            if (!saved)
                throw new error_middleware_1.AppError('Address not found', 400);
            return {
                firstName: saved.firstName,
                lastName: saved.lastName,
                phone: saved.phone,
                addressLine1: saved.addressLine1,
                addressLine2: saved.addressLine2 ?? '',
                city: saved.city,
                state: saved.state,
                pincode: saved.pincode,
                country: saved.country,
            };
        }
        const a = posted ?? {};
        const required = ['firstName', 'phone', 'addressLine1', 'city', 'state', 'pincode'];
        const missing = required.filter(f => !String(a[f] ?? '').trim());
        if (missing.length) {
            throw new error_middleware_1.AppError(`Delivery address is incomplete: ${missing.join(', ')}`, 400);
        }
        return {
            firstName: String(a.firstName).trim(),
            lastName: String(a.lastName ?? '').trim(),
            phone: String(a.phone).trim(),
            addressLine1: String(a.addressLine1).trim(),
            addressLine2: String(a.addressLine2 ?? '').trim(),
            city: String(a.city).trim(),
            state: String(a.state).trim(),
            pincode: String(a.pincode).trim(),
            country: String(a.country ?? 'India').trim(),
        };
    }
    /**
     * Which pincodes we deliver ourselves. Stored as a setting rather than in
     * code because the answer changes with hiring, not with releases: the shop
     * adds a nearby town the week it has someone to ride there.
     *
     * Entries are matched as prefixes, so "3020" covers every pincode in that
     * block and "302017" covers exactly one.
     */
    async selfDeliveryPincodes(tx) {
        const row = await tx.setting.findUnique({ where: { key: 'self_delivery_pincodes' } });
        return (row?.value ?? '')
            .split(/[,\n]/)
            .map(p => p.replace(/\D/g, ''))
            .filter(Boolean);
    }
    async defaultFulfilment(tx, pincode) {
        const clean = String(pincode ?? '').replace(/\D/g, '');
        if (!clean)
            return 'DELHIVERY';
        const prefixes = await this.selfDeliveryPincodes(tx);
        return prefixes.some(p => clean.startsWith(p)) ? 'SELF' : 'DELHIVERY';
    }
    async createOrder(userId, data) {
        return prisma_1.prisma.$transaction(async (tx) => {
            // 1. Fetch products and validate stock before touching any data
            const productIds = [...new Set(data.items.map(i => i.productId))];
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, isActive: true, deletedAt: null },
                select: {
                    id: true, name: true, stockQuantity: true,
                    standardShippingCharge: true,
                    codShippingCharge: true,
                    expressShippingCharge: true,
                    images: { where: { isPrimary: true }, take: 1, select: { url: true } },
                },
            });
            const productMap = new Map(products.map(p => [p.id, p]));
            // Order lines record the size, colour and SKU as they were at purchase.
            // Reading them back through the variant relation is not enough: a variant
            // can be renamed or deleted, and the warehouse still has to know which
            // size to pack.
            const variantIds = [...new Set(data.items.map(i => i.variantId).filter(Boolean))];
            const variants = variantIds.length
                ? await tx.productVariant.findMany({
                    where: { id: { in: variantIds } },
                    select: { id: true, size: true, color: true, sku: true, image: true },
                })
                : [];
            const variantMap = new Map(variants.map(v => [v.id, v]));
            for (const item of data.items) {
                const product = productMap.get(item.productId);
                if (!product)
                    throw new error_middleware_1.AppError(`Product not found: ${item.productId}`, 400);
                if (product.stockQuantity < item.quantity) {
                    throw new error_middleware_1.AppError(`Insufficient stock for "${product.name}"`, 400);
                }
            }
            // 2. Compute totals
            const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const method = (data.shippingMethod || 'STANDARD').toUpperCase();
            // Use per-product charge if set (take the max across all cart items),
            // otherwise fall back to the global rate for the chosen method.
            const fieldMap = {
                STANDARD: 'standardShippingCharge',
                COD: 'codShippingCharge',
                EXPRESS: 'expressShippingCharge',
            };
            const chargeField = fieldMap[method];
            let shippingCharge = OrderService.SHIPPING_RATES[method] ?? 79;
            if (chargeField) {
                const productCharges = data.items
                    .map(item => {
                    const p = productMap.get(item.productId);
                    return p ? Number(p[chargeField] ?? 0) : 0;
                })
                    .filter(c => c > 0);
                if (productCharges.length > 0) {
                    shippingCharge = Math.max(...productCharges);
                }
            }
            // Prices are GST-inclusive; taxAmount is stored for display/accounting only
            const taxAmount = subtotal * 0.18;
            let couponDiscount = 0;
            // 3. Validate and apply coupon inside the transaction
            if (data.couponCode) {
                const now = new Date();
                const coupon = await tx.coupon.findFirst({
                    where: {
                        code: data.couponCode,
                        isActive: true,
                        AND: [
                            { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
                            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                        ],
                    },
                });
                if (coupon && (!coupon.usageLimit || coupon.usageCount < coupon.usageLimit)) {
                    if (!coupon.minOrderAmount || subtotal >= Number(coupon.minOrderAmount)) {
                        if (coupon.type === 'PERCENTAGE') {
                            couponDiscount = (subtotal * Number(coupon.value)) / 100;
                            if (coupon.maxDiscount)
                                couponDiscount = Math.min(couponDiscount, Number(coupon.maxDiscount));
                        }
                        else if (coupon.type === 'FIXED') {
                            couponDiscount = Math.min(Number(coupon.value), subtotal);
                        }
                        await tx.coupon.update({
                            where: { id: coupon.id },
                            data: { usageCount: { increment: 1 } },
                        });
                    }
                }
            }
            const total = subtotal - couponDiscount + shippingCharge;
            const shippingAddress = await this.resolveShippingAddress(tx, userId, data.addressId, data.shippingAddress);
            const fulfilmentType = await this.defaultFulfilment(tx, shippingAddress.pincode);
            // 4. Create order with populated item names
            const order = await tx.order.create({
                data: {
                    orderNumber: (0, slugify_1.generateOrderNumber)(),
                    userId,
                    addressId: data.addressId,
                    status: 'PENDING',
                    paymentStatus: 'PENDING',
                    paymentMethod: data.paymentMethod,
                    shippingMethod: method,
                    subtotal,
                    discount: couponDiscount,
                    shippingCharge,
                    taxAmount,
                    total,
                    couponCode: data.couponCode,
                    couponDiscount,
                    notes: data.notes,
                    fulfilmentType,
                    shippingAddress,
                    billingAddress: data.billingAddress || shippingAddress,
                    items: {
                        create: data.items.map(item => {
                            const product = productMap.get(item.productId);
                            const variant = item.variantId ? variantMap.get(item.variantId) : undefined;
                            return {
                                productId: item.productId,
                                variantId: item.variantId,
                                quantity: item.quantity,
                                price: item.price,
                                total: item.price * item.quantity,
                                name: product?.name ?? '',
                                size: variant?.size ?? null,
                                color: variant?.color ?? null,
                                sku: variant?.sku ?? null,
                                image: variant?.image || product?.images?.[0]?.url || null,
                            };
                        }),
                    },
                },
                include: { items: true, address: true },
            });
            // 5. Atomically decrement stock within the same transaction
            for (const item of data.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        totalSold: { increment: item.quantity },
                        stockQuantity: { decrement: item.quantity },
                    },
                });
            }
            return order;
        });
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
                user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
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
        if (filters?.fulfilmentType)
            where.fulfilmentType = filters.fulfilmentType;
        if (filters?.search) {
            // Support staff are given a phone number far more often than an order
            // number, so the search covers every way a customer identifies themselves.
            where.OR = [
                { orderNumber: { contains: filters.search } },
                { user: { email: { contains: filters.search } } },
                { user: { phone: { contains: filters.search } } },
                { user: { firstName: { contains: filters.search } } },
                { user: { lastName: { contains: filters.search } } },
                { address: { phone: { contains: filters.search } } },
                { address: { pincode: { contains: filters.search } } },
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
                    user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                    items: { take: 1, include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
                    address: true,
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
        const existing = await prisma_1.prisma.order.findUnique({
            where: { id },
            select: { dispatchedAt: true },
        });
        if (!existing)
            throw new error_middleware_1.AppError('Order not found', 404);
        return prisma_1.prisma.order.update({
            where: { id },
            data: {
                status: status,
                ...(trackingNumber && { trackingNumber }),
                ...(trackingUrl && { trackingUrl }),
                // Stamped on the first move out of the building and never overwritten,
                // so re-applying SHIPPED after a correction does not reset the clock on
                // "how long did this take to go out?".
                ...(status === 'SHIPPED' && !existing.dispatchedAt && { dispatchedAt: new Date() }),
                ...(status === 'DELIVERED' && { deliveryDate: new Date() }),
            },
        });
    }
    /**
     * Admin-set delivery method and its details. Switching away from SELF clears
     * the rider's name and phone: leaving a person's name on an order the courier
     * is carrying makes the order lie about who has it.
     */
    async updateFulfilment(id, data) {
        const order = await prisma_1.prisma.order.findUnique({ where: { id } });
        if (!order)
            throw new error_middleware_1.AppError('Order not found', 404);
        const type = data.fulfilmentType ?? order.fulfilmentType;
        const switchingToCourier = type === 'DELHIVERY';
        return prisma_1.prisma.order.update({
            where: { id },
            data: {
                fulfilmentType: type,
                deliveryPartnerName: switchingToCourier ? null : data.deliveryPartnerName ?? order.deliveryPartnerName,
                deliveryPartnerPhone: switchingToCourier ? null : data.deliveryPartnerPhone ?? order.deliveryPartnerPhone,
                ...(data.deliveryNotes !== undefined && { deliveryNotes: data.deliveryNotes }),
                ...(data.codCollected !== undefined && { codCollected: data.codCollected }),
                ...(data.trackingNumber !== undefined && { trackingNumber: data.trackingNumber }),
                ...(data.trackingUrl !== undefined && { trackingUrl: data.trackingUrl }),
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
OrderService.SHIPPING_RATES = {
    STANDARD: 79,
    COD: 149,
    EXPRESS: 249,
};
exports.orderService = new OrderService();

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middlewares/error.middleware';
import { generateOrderNumber } from '../../../utils/slugify';
import { paginationParams } from '../../../utils/slugify';

export class OrderService {
  private static readonly SHIPPING_RATES: Record<string, number> = {
    STANDARD: 79,
    COD:      149,
    EXPRESS:  249,
  };

  async createOrder(userId: string, data: {
    addressId: string;
    paymentMethod: string;
    shippingMethod?: string;
    couponCode?: string;
    notes?: string;
    items: { productId: string; variantId?: string; quantity: number; price: number }[];
    shippingAddress: object;
    billingAddress?: object;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch products and validate stock before touching any data
      const productIds = [...new Set(data.items.map(i => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
        select: {
          id: true, name: true, stockQuantity: true,
          standardShippingCharge: true,
          codShippingCharge: true,
          expressShippingCharge: true,
        },
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      for (const item of data.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);
        if (product.stockQuantity < item.quantity) {
          throw new AppError(`Insufficient stock for "${product.name}"`, 400);
        }
      }

      // 2. Compute totals
      const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const method = (data.shippingMethod || 'STANDARD').toUpperCase();

      // Use per-product charge if set (take the max across all cart items),
      // otherwise fall back to the global rate for the chosen method.
      const fieldMap: Record<string, 'standardShippingCharge' | 'codShippingCharge' | 'expressShippingCharge'> = {
        STANDARD: 'standardShippingCharge',
        COD:      'codShippingCharge',
        EXPRESS:  'expressShippingCharge',
      };
      const chargeField = fieldMap[method];
      let shippingCharge = OrderService.SHIPPING_RATES[method] ?? 79;
      if (chargeField) {
        const productCharges = data.items
          .map(item => {
            const p = productMap.get(item.productId);
            return p ? Number((p as any)[chargeField] ?? 0) : 0;
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
              if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, Number(coupon.maxDiscount));
            } else if (coupon.type === 'FIXED') {
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

      // 4. Create order with populated item names
      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          addressId: data.addressId,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: data.paymentMethod as any,
          shippingMethod: method,
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
              name: productMap.get(item.productId)?.name ?? '',
            })),
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

  async getOrderById(id: string, userId?: string) {
    const where = userId ? { id, userId } : { id };
    const order = await prisma.order.findFirst({
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

    if (!order) throw new AppError('Order not found', 404);
    return order;
  }

  async getOrderByNumber(orderNumber: string) {
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      include: {
        items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } }, variant: true } },
        address: true,
        payment: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    return order;
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    const { skip } = paginationParams(page, limit);
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: {
          items: { take: 2, include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { userId } }),
    ]);
    return { orders, total, page, limit };
  }

  async getAllOrders(page = 1, limit = 20, filters?: {
    status?: string;
    paymentStatus?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { skip } = paginationParams(page, limit);
    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters?.search) {
      where.OR = [
        { orderNumber: { contains: filters.search } },
        { user: { email: { contains: filters.search } } },
      ];
    }
    if (filters?.startDate) where.createdAt = { gte: new Date(filters.startDate) };
    if (filters?.endDate) where.createdAt = { ...where.createdAt, lte: new Date(filters.endDate) };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
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
      prisma.order.count({ where }),
    ]);

    return { orders, total, page, limit };
  }

  async updateOrderStatus(id: string, status: string, trackingNumber?: string, trackingUrl?: string) {
    return prisma.order.update({
      where: { id },
      data: {
        status: status as any,
        ...(trackingNumber && { trackingNumber }),
        ...(trackingUrl && { trackingUrl }),
        ...(status === 'DELIVERED' && { deliveryDate: new Date() }),
      },
    });
  }

  async cancelOrder(id: string, userId: string, reason: string) {
    const order = await prisma.order.findFirst({
      where: { id, userId, status: { in: ['PENDING', 'CONFIRMED'] } },
    });
    if (!order) throw new AppError('Order cannot be cancelled', 400);

    return prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
  }
}

export const orderService = new OrderService();

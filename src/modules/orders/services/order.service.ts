import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middlewares/error.middleware';
import { generateOrderNumber } from '../../../utils/slugify';
import { paginationParams } from '../../../utils/slugify';

export class OrderService {
  async createOrder(userId: string, data: {
    addressId: string;
    paymentMethod: string;
    couponCode?: string;
    notes?: string;
    items: { productId: string; variantId?: string; quantity: number; price: number }[];
    shippingAddress: object;
    billingAddress?: object;
  }) {
    const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let couponDiscount = 0;
    let shippingCharge = subtotal < 999 ? 99 : 0;
    const taxAmount = subtotal * 0.18;
    const total = subtotal - couponDiscount + shippingCharge;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        addressId: data.addressId,
        status: 'PENDING',
        paymentStatus: data.paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
        paymentMethod: data.paymentMethod as any,
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
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          totalSold: { increment: item.quantity },
          stockQuantity: { decrement: item.quantity },
        },
      });
    }

    return order;
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

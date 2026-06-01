import { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import { sendSuccess } from '../../../utils/response';

export class AnalyticsController {
  async getDashboard(req: Request, res: Response) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalRevenue,
      todayRevenue,
      monthRevenue,
      totalOrders,
      pendingOrders,
      totalProducts,
      totalCustomers,
      recentOrders,
      topProducts,
      ordersByStatus,
      revenueByDay,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID', createdAt: { gte: startOfDay } },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID', createdAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { totalSold: 'desc' },
        take: 10,
        select: {
          id: true, name: true, slug: true, totalSold: true, basePrice: true, salePrice: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
        },
      }),
      prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.$queryRaw`
        SELECT
          DATE(createdAt) as date,
          CAST(SUM(total) AS DECIMAL(10,2)) as revenue,
          CAST(COUNT(*) AS UNSIGNED) as orders
        FROM orders
        WHERE createdAt >= ${last30Days} AND paymentStatus = 'PAID'
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `,
    ]);

    return sendSuccess(res, {
      revenue: {
        total: totalRevenue._sum.total || 0,
        today: todayRevenue._sum.total || 0,
        month: monthRevenue._sum.total || 0,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
      },
      products: totalProducts,
      customers: totalCustomers,
      recentOrders,
      topProducts,
      ordersByStatus,
      revenueByDay,
    }, 'Dashboard data');
  }

  async getRevenueReport(req: Request, res: Response) {
    const { startDate, endDate } = req.query as Record<string, string>;

    const start = startDate ? new Date(startDate) : new Date('2020-01-01');
    const end = endDate ? new Date(endDate) : new Date();

    const data = await prisma.$queryRaw`
      SELECT
        DATE(createdAt) as date,
        CAST(COUNT(*) AS UNSIGNED) as orders,
        CAST(SUM(total) AS DECIMAL(10,2)) as revenue,
        CAST(SUM(discount) AS DECIMAL(10,2)) as discounts
      FROM orders
      WHERE paymentStatus = 'PAID'
        AND createdAt BETWEEN ${start} AND ${end}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `;

    return sendSuccess(res, data, 'Revenue report');
  }
}

export const analyticsController = new AnalyticsController();

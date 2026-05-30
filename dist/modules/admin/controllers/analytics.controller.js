"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsController = exports.AnalyticsController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
class AnalyticsController {
    async getDashboard(req, res) {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [totalRevenue, todayRevenue, monthRevenue, totalOrders, pendingOrders, totalProducts, totalCustomers, recentOrders, topProducts, ordersByStatus, revenueByDay,] = await Promise.all([
            prisma_1.prisma.order.aggregate({
                where: { paymentStatus: 'PAID' },
                _sum: { total: true },
            }),
            prisma_1.prisma.order.aggregate({
                where: { paymentStatus: 'PAID', createdAt: { gte: startOfDay } },
                _sum: { total: true },
            }),
            prisma_1.prisma.order.aggregate({
                where: { paymentStatus: 'PAID', createdAt: { gte: startOfMonth } },
                _sum: { total: true },
            }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.order.count({ where: { status: 'PENDING' } }),
            prisma_1.prisma.product.count({ where: { isActive: true, deletedAt: null } }),
            prisma_1.prisma.user.count({ where: { role: 'CUSTOMER' } }),
            prisma_1.prisma.order.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                    user: { select: { firstName: true, lastName: true, email: true } },
                    _count: { select: { items: true } },
                },
            }),
            prisma_1.prisma.product.findMany({
                where: { isActive: true },
                orderBy: { totalSold: 'desc' },
                take: 10,
                select: {
                    id: true, name: true, slug: true, totalSold: true, basePrice: true, salePrice: true,
                    images: { where: { isPrimary: true }, take: 1, select: { url: true } },
                },
            }),
            prisma_1.prisma.order.groupBy({
                by: ['status'],
                _count: { status: true },
            }),
            prisma_1.prisma.$queryRaw `
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
        return (0, response_1.sendSuccess)(res, {
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
    async getRevenueReport(req, res) {
        const { startDate, endDate } = req.query;
        const start = startDate ? new Date(startDate) : new Date('2020-01-01');
        const end = endDate ? new Date(endDate) : new Date();
        const data = await prisma_1.prisma.$queryRaw `
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
        return (0, response_1.sendSuccess)(res, data, 'Revenue report');
    }
}
exports.AnalyticsController = AnalyticsController;
exports.analyticsController = new AnalyticsController();

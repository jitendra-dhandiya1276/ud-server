"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.couponController = exports.CouponController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
class CouponController {
    async getAll(req, res) {
        const { page, limit, search, isActive } = req.query;
        const where = {};
        if (search)
            where.code = { contains: search.toUpperCase() };
        if (isActive !== undefined)
            where.isActive = isActive === 'true';
        const { page: p, limit: l, skip } = (0, slugify_1.paginationParams)(page, limit);
        const [data, total] = await Promise.all([
            prisma_1.prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: l }),
            prisma_1.prisma.coupon.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, data, total, p, l, 'Coupons fetched');
    }
    async getByCode(req, res) {
        const { code } = req.params;
        const coupon = await prisma_1.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
        if (!coupon)
            return (0, response_1.sendSuccess)(res, null, 'Coupon not found', 404);
        return (0, response_1.sendSuccess)(res, coupon, 'Coupon fetched');
    }
    async create(req, res) {
        const data = { ...req.body, code: req.body.code?.toUpperCase() };
        const coupon = await prisma_1.prisma.coupon.create({ data });
        return (0, response_1.sendSuccess)(res, coupon, 'Coupon created', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const data = { ...req.body };
        if (data.code)
            data.code = data.code.toUpperCase();
        const coupon = await prisma_1.prisma.coupon.update({ where: { id }, data });
        return (0, response_1.sendSuccess)(res, coupon, 'Coupon updated');
    }
    async delete(req, res) {
        const { id } = req.params;
        await prisma_1.prisma.coupon.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Coupon deleted');
    }
    async validate(req, res) {
        const { code, cartTotal } = req.body;
        const coupon = await prisma_1.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
        if (!coupon || !coupon.isActive) {
            return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
        }
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'Coupon expired' });
        }
        if (coupon.minOrderAmount && Number(cartTotal) < Number(coupon.minOrderAmount)) {
            return res.status(400).json({ success: false, message: `Minimum order amount is ₹${coupon.minOrderAmount}` });
        }
        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
        }
        return (0, response_1.sendSuccess)(res, coupon, 'Coupon is valid');
    }
}
exports.CouponController = CouponController;
exports.couponController = new CouponController();

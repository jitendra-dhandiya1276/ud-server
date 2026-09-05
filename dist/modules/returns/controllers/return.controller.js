"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnController = exports.ReturnController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const error_middleware_1 = require("../../../middlewares/error.middleware");
const logger_1 = require("../../../utils/logger");
/**
 * Returns are raised on Instagram, not here.
 *
 * The published policy makes Instagram the only support channel and requires
 * an unedited unboxing video, so customers cannot open a request from this
 * API — giving them a second route would leave the team watching two inboxes
 * and would contradict what the policy page tells them to do.
 *
 * What this does is make the outcome visible: the office records the request
 * after the DM, and the customer can then see where it has got to instead of
 * asking again.
 */
const ORDER_SUMMARY = {
    select: {
        id: true, orderNumber: true, total: true, status: true,
        deliveryDate: true, createdAt: true,
    },
};
class ReturnController {
    /** The signed-in customer's own requests. Scoped by userId, not just role. */
    async getMyReturns(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const returns = await prisma_1.prisma.returnRequest.findMany({
            where: { userId: req.user.userId },
            include: { order: ORDER_SUMMARY },
            orderBy: { createdAt: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, returns, 'Returns fetched');
    }
    // ─── Admin ───────────────────────────────────────────────────────────
    async getAll(req, res) {
        const { status } = req.query;
        const where = {};
        if (status && status !== 'ALL')
            where.status = status;
        const returns = await prisma_1.prisma.returnRequest.findMany({
            where,
            include: {
                order: {
                    select: {
                        ...ORDER_SUMMARY.select,
                        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, returns, 'Returns fetched');
    }
    /**
     * Recorded by the office from an Instagram conversation, so the order is
     * looked up rather than trusted: the userId is taken from the order itself,
     * never from the request body, or a typo would file a return against the
     * wrong customer's account.
     */
    async create(req, res) {
        const { orderId, reason, description, refundAmount } = req.body;
        if (!orderId || !String(reason ?? '').trim()) {
            throw new error_middleware_1.AppError('An order and a reason are required', 400);
        }
        const order = await prisma_1.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, userId: true, orderNumber: true },
        });
        if (!order)
            throw new error_middleware_1.AppError('Order not found', 404);
        const created = await prisma_1.prisma.returnRequest.create({
            data: {
                orderId: order.id,
                userId: order.userId,
                reason: String(reason).trim(),
                description: description ? String(description).trim() : null,
                ...(refundAmount != null && refundAmount !== '' && { refundAmount: Number(refundAmount) }),
            },
            include: { order: ORDER_SUMMARY },
        });
        logger_1.logger.info('Return recorded', { returnId: created.id, orderNumber: order.orderNumber });
        return (0, response_1.sendSuccess)(res, created, 'Return recorded', 201);
    }
    async update(req, res) {
        const { id } = req.params;
        const { status, adminNote, refundAmount, reason, description } = req.body;
        const existing = await prisma_1.prisma.returnRequest.findUnique({ where: { id } });
        if (!existing)
            throw new error_middleware_1.AppError('Return request not found', 404);
        const VALID = ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'];
        if (status && !VALID.includes(status)) {
            throw new error_middleware_1.AppError(`Status must be one of ${VALID.join(', ')}`, 400);
        }
        const updated = await prisma_1.prisma.returnRequest.update({
            where: { id },
            data: {
                ...(status && { status }),
                ...(adminNote !== undefined && { adminNote: adminNote || null }),
                ...(reason && { reason: String(reason).trim() }),
                ...(description !== undefined && { description: description || null }),
                ...(refundAmount !== undefined && {
                    refundAmount: refundAmount === '' || refundAmount === null ? null : Number(refundAmount),
                }),
            },
            include: { order: ORDER_SUMMARY },
        });
        return (0, response_1.sendSuccess)(res, updated, 'Return updated');
    }
    async remove(req, res) {
        const { id } = req.params;
        const existing = await prisma_1.prisma.returnRequest.findUnique({ where: { id } });
        if (!existing)
            throw new error_middleware_1.AppError('Return request not found', 404);
        await prisma_1.prisma.returnRequest.delete({ where: { id } });
        return (0, response_1.sendSuccess)(res, null, 'Return deleted');
    }
}
exports.ReturnController = ReturnController;
exports.returnController = new ReturnController();
exports.default = exports.returnController;

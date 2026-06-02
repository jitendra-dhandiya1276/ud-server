"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = exports.PaymentController = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../../config/prisma");
const env_1 = require("../../../config/env");
const response_1 = require("../../../utils/response");
const razorpay = new razorpay_1.default({
    key_id: env_1.config.razorpay.keyId,
    key_secret: env_1.config.razorpay.keySecret,
});
class PaymentController {
    async createRazorpayOrder(req, res) {
        const { orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(Number(order.total) * 100),
            currency: 'INR',
            receipt: order.orderNumber,
            notes: { orderId: order.id },
        });
        await prisma_1.prisma.payment.upsert({
            where: { orderId },
            create: { orderId, amount: order.total, method: 'RAZORPAY', razorpayOrderId: razorpayOrder.id },
            update: { razorpayOrderId: razorpayOrder.id },
        });
        return (0, response_1.sendSuccess)(res, {
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: env_1.config.razorpay.keyId,
        }, 'Razorpay order created');
    }
    async verifyPayment(req, res) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', env_1.config.razorpay.keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');
        if (expectedSignature !== razorpay_signature) {
            return (0, response_1.sendError)(res, 'Invalid payment signature', 400);
        }
        await prisma_1.prisma.payment.update({
            where: { orderId },
            data: {
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                status: 'PAID',
            },
        });
        await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
        });
        return (0, response_1.sendSuccess)(res, null, 'Payment verified successfully');
    }
}
exports.PaymentController = PaymentController;
exports.paymentController = new PaymentController();

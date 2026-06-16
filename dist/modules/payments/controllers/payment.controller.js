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
// ── Razorpay ────────────────────────────────────────────────────────
let _razorpay = null;
const getRazorpay = () => {
    if (!_razorpay) {
        if (!env_1.config.razorpay.keyId || !env_1.config.razorpay.keySecret) {
            throw new Error('Razorpay keys not configured');
        }
        _razorpay = new razorpay_1.default({ key_id: env_1.config.razorpay.keyId, key_secret: env_1.config.razorpay.keySecret });
    }
    return _razorpay;
};
// ── Cashfree ────────────────────────────────────────────────────────
const CF_BASE = {
    sandbox: 'https://sandbox.cashfree.com/pg',
    production: 'https://api.cashfree.com/pg',
};
const cfHeaders = () => ({
    'x-api-version': '2023-08-01',
    'x-client-id': env_1.config.cashfree.appId,
    'x-client-secret': env_1.config.cashfree.secretKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
});
const cfFetch = async (path, opts = {}) => {
    const base = CF_BASE[env_1.config.cashfree.env];
    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: { ...cfHeaders(), ...(opts.headers || {}) },
    });
    const json = await res.json();
    if (!res.ok)
        throw new Error(json?.message || json?.type || 'Cashfree API error');
    return json;
};
// ── Controller ───────────────────────────────────────────────────────
class PaymentController {
    // ── Razorpay: create order ────────────────────────────────────────
    async createRazorpayOrder(req, res) {
        const { orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const razorpayOrder = await getRazorpay().orders.create({
            amount: Math.round(Number(order.total) * 100),
            currency: 'INR',
            receipt: order.orderNumber,
            notes: { orderId: order.id },
        });
        await prisma_1.prisma.payment.upsert({
            where: { orderId },
            create: { orderId, amount: order.total, method: 'RAZORPAY', razorpayOrderId: razorpayOrder.id },
            update: { razorpayOrderId: razorpayOrder.id, method: 'RAZORPAY' },
        });
        return (0, response_1.sendSuccess)(res, {
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: env_1.config.razorpay.keyId,
        }, 'Razorpay order created');
    }
    // ── Razorpay: verify payment ──────────────────────────────────────
    async verifyPayment(req, res) {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const expected = crypto_1.default
            .createHmac('sha256', env_1.config.razorpay.keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');
        if (expected !== razorpay_signature)
            return (0, response_1.sendError)(res, 'Invalid payment signature', 400);
        await prisma_1.prisma.payment.update({
            where: { orderId },
            data: { razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, status: 'PAID' },
        });
        await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
        });
        return (0, response_1.sendSuccess)(res, null, 'Payment verified successfully');
    }
    // ── Cashfree: create order → returns payment_session_id ──────────
    async createCashfreeOrder(req, res) {
        const { orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true },
        });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const user = order.user;
        const phone = (user.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';
        const cfOrderId = `cf_${order.orderNumber}`;
        const cfData = await cfFetch('/orders', {
            method: 'POST',
            body: JSON.stringify({
                order_id: cfOrderId,
                order_amount: Number(order.total),
                order_currency: 'INR',
                customer_details: {
                    customer_id: user.id,
                    customer_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
                    customer_email: user.email,
                    customer_phone: phone,
                },
                order_meta: {
                    notify_url: `${env_1.config.baseUrl}/api/v1/payments/cashfree/webhook`,
                },
                order_note: `Order ${order.orderNumber}`,
            }),
        });
        await prisma_1.prisma.payment.upsert({
            where: { orderId },
            create: { orderId, amount: order.total, method: 'CASHFREE', cashfreeOrderId: cfData.order_id },
            update: { method: 'CASHFREE', cashfreeOrderId: cfData.order_id, status: 'PENDING' },
        });
        await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { paymentMethod: 'CASHFREE' },
        });
        return (0, response_1.sendSuccess)(res, {
            paymentSessionId: cfData.payment_session_id,
            cfOrderId: cfData.order_id,
            orderId,
            orderNumber: order.orderNumber,
        }, 'Cashfree order created');
    }
    // ── Cashfree: get payment status (called after modal closes) ──────
    async getCashfreePaymentStatus(req, res) {
        const { orderId } = req.params;
        const order = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        const payment = await prisma_1.prisma.payment.findUnique({ where: { orderId } });
        if (!payment?.cashfreeOrderId)
            return (0, response_1.sendError)(res, 'Payment not initiated', 404);
        // Canonical truth: re-fetch live status from Cashfree
        const cfData = await cfFetch(`/orders/${payment.cashfreeOrderId}`);
        const cfStatus = cfData.order_status || '';
        let dbStatus = 'PENDING';
        if (cfStatus === 'PAID') {
            dbStatus = 'PAID';
        }
        else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(cfStatus)) {
            dbStatus = 'FAILED';
        }
        if (dbStatus === 'PAID' && payment.status !== 'PAID') {
            const cfPaymentId = cfData.payments?.[0]?.cf_payment_id?.toString();
            await prisma_1.prisma.payment.update({
                where: { orderId },
                data: { status: 'PAID', ...(cfPaymentId && { cashfreePaymentId: cfPaymentId }), gatewayResponse: cfData },
            });
            await prisma_1.prisma.order.update({
                where: { id: orderId },
                data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
            });
        }
        else if (dbStatus === 'FAILED' && payment.status !== 'FAILED') {
            await prisma_1.prisma.payment.update({
                where: { orderId },
                data: { status: 'FAILED', gatewayResponse: cfData },
            });
            await prisma_1.prisma.order.update({
                where: { id: orderId },
                data: { paymentStatus: 'FAILED' },
            });
        }
        return (0, response_1.sendSuccess)(res, {
            cfStatus,
            paymentStatus: dbStatus,
            orderNumber: order.orderNumber,
        });
    }
    // ── Cashfree: webhook (server-to-server, no auth) ─────────────────
    // We verify by re-fetching from Cashfree API instead of raw-body HMAC
    // (express.json() pre-parses the body, losing the raw string needed for sig check)
    async cashfreeWebhook(req, res) {
        try {
            const cfOrderId = req.body?.data?.order?.order_id || '';
            if (!cfOrderId)
                return res.json({ success: true });
            const payment = await prisma_1.prisma.payment.findFirst({ where: { cashfreeOrderId: cfOrderId } });
            if (!payment)
                return res.json({ success: true });
            const cfData = await cfFetch(`/orders/${cfOrderId}`).catch(() => null);
            if (!cfData)
                return res.json({ success: true });
            if (cfData.order_status === 'PAID') {
                const cfPaymentId = cfData.payments?.[0]?.cf_payment_id?.toString();
                await prisma_1.prisma.payment.update({
                    where: { orderId: payment.orderId },
                    data: { status: 'PAID', ...(cfPaymentId && { cashfreePaymentId: cfPaymentId }), gatewayResponse: cfData },
                });
                await prisma_1.prisma.order.update({
                    where: { id: payment.orderId },
                    data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
                });
            }
            else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(cfData.order_status || '')) {
                await prisma_1.prisma.payment.update({
                    where: { orderId: payment.orderId },
                    data: { status: 'FAILED', gatewayResponse: cfData },
                });
                await prisma_1.prisma.order.update({
                    where: { id: payment.orderId },
                    data: { paymentStatus: 'FAILED' },
                });
            }
        }
        catch {
            // Always ACK to prevent Cashfree retries
        }
        return res.json({ success: true });
    }
}
exports.PaymentController = PaymentController;
exports.paymentController = new PaymentController();

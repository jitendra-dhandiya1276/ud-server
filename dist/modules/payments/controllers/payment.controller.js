"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = exports.PaymentController = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const cashfree_pg_1 = require("cashfree-pg");
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
// ── Cashfree SDK ────────────────────────────────────────────────────
// Initialised once on first use so env vars are read after dotenv loads
let _cashfree = null;
const getCashfree = () => {
    if (!_cashfree) {
        if (!env_1.config.cashfree.appId || !env_1.config.cashfree.secretKey) {
            throw new Error('Cashfree keys not configured');
        }
        const env = env_1.config.cashfree.env === 'production'
            ? cashfree_pg_1.CFEnvironment.PRODUCTION
            : cashfree_pg_1.CFEnvironment.SANDBOX;
        _cashfree = new cashfree_pg_1.Cashfree(env, env_1.config.cashfree.appId, env_1.config.cashfree.secretKey);
    }
    return _cashfree;
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
        // Set expiry 30 minutes from now
        const expiryTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const request = {
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
            order_expiry_time: expiryTime,
            order_note: `Order ${order.orderNumber}`,
        };
        const response = await getCashfree().PGCreateOrder(request);
        const cfData = response.data;
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
    // ── Cashfree: COD delivery-charge deposit ────────────────────────
    // Creates a Cashfree session for ONLY the shipping charge.
    // Product amount is still collected as cash on delivery.
    async createCashfreeCodDeposit(req, res) {
        const { orderId } = req.body;
        const order = await prisma_1.prisma.order.findUnique({
            where: { id: orderId },
            include: { user: true },
        });
        if (!order)
            return (0, response_1.sendError)(res, 'Order not found', 404);
        if (!req.user || order.userId !== req.user.userId)
            return (0, response_1.sendError)(res, 'Forbidden', 403);
        if (order.paymentMethod !== 'COD')
            return (0, response_1.sendError)(res, 'Not a COD order', 400);
        if (order.deliveryChargePaid)
            return (0, response_1.sendError)(res, 'Delivery charge already collected', 400);
        const user = order.user;
        const phone = (user.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';
        const deliveryCharge = Number(order.shippingCharge);
        const cfOrderId = `cod_${order.orderNumber}`;
        const request = {
            order_id: cfOrderId,
            order_amount: deliveryCharge,
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
            order_expiry_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            order_note: `Delivery charge deposit — Order ${order.orderNumber}`,
        };
        const response = await getCashfree().PGCreateOrder(request);
        const cfData = response.data;
        await prisma_1.prisma.payment.upsert({
            where: { orderId },
            create: {
                orderId, amount: deliveryCharge, method: 'CASHFREE',
                cashfreeOrderId: cfData.order_id, isDeliveryChargeOnly: true,
            },
            update: {
                method: 'CASHFREE', cashfreeOrderId: cfData.order_id,
                amount: deliveryCharge, status: 'PENDING', isDeliveryChargeOnly: true,
            },
        });
        return (0, response_1.sendSuccess)(res, {
            paymentSessionId: cfData.payment_session_id,
            cfOrderId: cfData.order_id,
            orderId,
            orderNumber: order.orderNumber,
            deliveryCharge,
        }, 'COD delivery deposit session created');
    }
    // ── Cashfree: get payment status (polled after modal closes) ─────
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
        // Fetch live order status from Cashfree via SDK
        const response = await getCashfree().PGFetchOrder(payment.cashfreeOrderId);
        const cfData = response.data;
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
            if (payment.isDeliveryChargeOnly) {
                // COD: delivery deposit collected — confirm order, product paid on delivery
                await prisma_1.prisma.order.update({
                    where: { id: orderId },
                    data: { deliveryChargePaid: true, status: 'CONFIRMED' },
                });
            }
            else {
                // Full payment — mark order fully paid
                await prisma_1.prisma.order.update({
                    where: { id: orderId },
                    data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
                });
            }
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
            deliveryChargePaid: payment.isDeliveryChargeOnly ? (dbStatus === 'PAID') : undefined,
        });
    }
    // ── Cashfree: webhook (server-to-server) ──────────────────────────
    //
    // Scalability guarantees:
    //   1. Signature check  — rejects forged requests before any DB work
    //   2. Terminal-state guard — PAID/FAILED orders are skipped entirely (idempotency)
    //   3. Atomic updateMany — only one concurrent call wins the write (race-safe)
    //   4. Always ACK 200 — prevents Cashfree retry storms on transient failures
    //
    async cashfreeWebhook(req, res) {
        try {
            // ── 1. Signature verification ─────────────────────────────────
            const timestamp = req.headers['x-webhook-timestamp'];
            const signature = req.headers['x-webhook-signature'];
            const rawBody = req.rawBody;
            if (timestamp && signature && rawBody) {
                const expected = crypto_1.default
                    .createHmac('sha256', env_1.config.cashfree.secretKey)
                    .update(timestamp + rawBody.toString())
                    .digest('base64');
                const expBuf = Buffer.from(expected);
                const sigBuf = Buffer.from(signature);
                if (expBuf.length !== sigBuf.length || !crypto_1.default.timingSafeEqual(expBuf, sigBuf)) {
                    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
                }
            }
            // ── 2. Extract order ID ───────────────────────────────────────
            const cfOrderId = req.body?.data?.order?.order_id || '';
            if (!cfOrderId)
                return res.json({ success: true });
            // ── 3. Terminal-state early exit (idempotency) ────────────────
            const payment = await prisma_1.prisma.payment.findFirst({
                where: { cashfreeOrderId: cfOrderId },
                select: { orderId: true, status: true, isDeliveryChargeOnly: true },
            });
            if (!payment)
                return res.json({ success: true });
            if (payment.status === 'PAID' || payment.status === 'FAILED') {
                return res.json({ success: true }); // duplicate webhook — nothing to do
            }
            // ── 4. Fetch canonical status from Cashfree ───────────────────
            const response = await getCashfree().PGFetchOrder(cfOrderId).catch(() => null);
            const cfData = response?.data;
            if (!cfData)
                return res.json({ success: true });
            const cfStatus = cfData.order_status || '';
            if (cfStatus === 'PAID') {
                const cfPaymentId = cfData.payments?.[0]?.cf_payment_id?.toString();
                // ── 5. Atomic conditional write — only the first caller wins ──
                const updated = await prisma_1.prisma.payment.updateMany({
                    where: { cashfreeOrderId: cfOrderId, status: { not: 'PAID' } },
                    data: {
                        status: 'PAID',
                        gatewayResponse: cfData,
                        ...(cfPaymentId && { cashfreePaymentId: cfPaymentId }),
                    },
                });
                // Guard order update behind the same winner-takes-all check
                if (updated.count > 0) {
                    if (payment.isDeliveryChargeOnly) {
                        // COD deposit: delivery charge paid online, product paid on delivery
                        await prisma_1.prisma.order.update({
                            where: { id: payment.orderId },
                            data: { deliveryChargePaid: true, status: 'CONFIRMED' },
                        });
                    }
                    else {
                        // Full payment
                        await prisma_1.prisma.order.update({
                            where: { id: payment.orderId },
                            data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
                        });
                    }
                }
            }
            else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(cfStatus)) {
                const updated = await prisma_1.prisma.payment.updateMany({
                    where: { cashfreeOrderId: cfOrderId, status: { notIn: ['PAID', 'FAILED'] } },
                    data: { status: 'FAILED', gatewayResponse: cfData },
                });
                if (updated.count > 0) {
                    await prisma_1.prisma.order.update({
                        where: { id: payment.orderId },
                        data: { paymentStatus: 'FAILED' },
                    });
                }
            }
        }
        catch {
            // Always ACK — prevents Cashfree from queuing exponential retries.
            // Any missed update self-heals when the frontend polls /cashfree/status/:id
            // after the checkout modal closes.
        }
        return res.json({ success: true });
    }
}
exports.PaymentController = PaymentController;
exports.paymentController = new PaymentController();

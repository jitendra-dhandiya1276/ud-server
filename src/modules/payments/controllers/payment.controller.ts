import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { prisma } from '../../../config/prisma';
import { config } from '../../../config/env';
import { sendSuccess, sendError } from '../../../utils/response';

// ── Razorpay ────────────────────────────────────────────────────────
let _razorpay: Razorpay | null = null;
const getRazorpay = () => {
  if (!_razorpay) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay keys not configured');
    }
    _razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  }
  return _razorpay;
};

// ── Cashfree ────────────────────────────────────────────────────────
const CF_BASE = {
  sandbox:    'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
};

const cfHeaders = () => ({
  'x-api-version':   '2023-08-01',
  'x-client-id':     config.cashfree.appId,
  'x-client-secret': config.cashfree.secretKey,
  'Content-Type':    'application/json',
  'Accept':          'application/json',
});

const cfFetch = async (path: string, opts: RequestInit = {}) => {
  const base = CF_BASE[config.cashfree.env];
  const res  = await fetch(`${base}${path}`, {
    ...opts,
    headers: { ...cfHeaders(), ...((opts.headers as Record<string, string>) || {}) },
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(json?.message || json?.type || 'Cashfree API error');
  return json;
};

// ── Controller ───────────────────────────────────────────────────────
export class PaymentController {

  // ── Razorpay: create order ────────────────────────────────────────
  async createRazorpayOrder(req: Request, res: Response) {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const razorpayOrder = await getRazorpay().orders.create({
      amount:   Math.round(Number(order.total) * 100),
      currency: 'INR',
      receipt:  order.orderNumber,
      notes:    { orderId: order.id },
    });

    await prisma.payment.upsert({
      where:  { orderId },
      create: { orderId, amount: order.total, method: 'RAZORPAY', razorpayOrderId: razorpayOrder.id },
      update: { razorpayOrderId: razorpayOrder.id, method: 'RAZORPAY' },
    });

    return sendSuccess(res, {
      razorpayOrderId: razorpayOrder.id,
      amount:   razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key:      config.razorpay.keyId,
    }, 'Razorpay order created');
  }

  // ── Razorpay: verify payment ──────────────────────────────────────
  async verifyPayment(req: Request, res: Response) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const expected = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expected !== razorpay_signature) return sendError(res, 'Invalid payment signature', 400);

    await prisma.payment.update({
      where: { orderId },
      data:  { razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature, status: 'PAID' },
    });
    await prisma.order.update({
      where: { id: orderId },
      data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
    });
    return sendSuccess(res, null, 'Payment verified successfully');
  }

  // ── Cashfree: create order → returns payment_session_id ──────────
  async createCashfreeOrder(req: Request, res: Response) {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({
      where:   { id: orderId },
      include: { user: true },
    });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const user  = order.user as any;
    const phone = (user.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';

    const cfOrderId = `cf_${order.orderNumber}`;

    const cfData = await cfFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id:       cfOrderId,
        order_amount:   Number(order.total),
        order_currency: 'INR',
        customer_details: {
          customer_id:    user.id,
          customer_name:  `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
          customer_email: user.email,
          customer_phone: phone,
        },
        order_meta: {
          notify_url: `${config.baseUrl}/api/v1/payments/cashfree/webhook`,
        },
        order_note: `Order ${order.orderNumber}`,
      }),
    });

    await prisma.payment.upsert({
      where:  { orderId },
      create: { orderId, amount: order.total, method: 'CASHFREE', cashfreeOrderId: cfData.order_id },
      update: { method: 'CASHFREE', cashfreeOrderId: cfData.order_id, status: 'PENDING' },
    });

    await prisma.order.update({
      where: { id: orderId },
      data:  { paymentMethod: 'CASHFREE' },
    });

    return sendSuccess(res, {
      paymentSessionId: cfData.payment_session_id,
      cfOrderId:        cfData.order_id,
      orderId,
      orderNumber:      order.orderNumber,
    }, 'Cashfree order created');
  }

  // ── Cashfree: get payment status (called after modal closes) ──────
  async getCashfreePaymentStatus(req: Request, res: Response) {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment?.cashfreeOrderId) return sendError(res, 'Payment not initiated', 404);

    // Canonical truth: re-fetch live status from Cashfree
    const cfData = await cfFetch(`/orders/${payment.cashfreeOrderId}`);
    const cfStatus: string = cfData.order_status || '';

    let dbStatus: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';
    if (cfStatus === 'PAID') {
      dbStatus = 'PAID';
    } else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(cfStatus)) {
      dbStatus = 'FAILED';
    }

    if (dbStatus === 'PAID' && payment.status !== 'PAID') {
      const cfPaymentId = cfData.payments?.[0]?.cf_payment_id?.toString();
      await prisma.payment.update({
        where: { orderId },
        data:  { status: 'PAID', ...(cfPaymentId && { cashfreePaymentId: cfPaymentId }), gatewayResponse: cfData },
      });
      await prisma.order.update({
        where: { id: orderId },
        data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
      });
    } else if (dbStatus === 'FAILED' && payment.status !== 'FAILED') {
      await prisma.payment.update({
        where: { orderId },
        data:  { status: 'FAILED', gatewayResponse: cfData },
      });
      await prisma.order.update({
        where: { id: orderId },
        data:  { paymentStatus: 'FAILED' },
      });
    }

    return sendSuccess(res, {
      cfStatus,
      paymentStatus: dbStatus,
      orderNumber:   order.orderNumber,
    });
  }

  // ── Cashfree: webhook (server-to-server, no auth) ─────────────────
  // We verify by re-fetching from Cashfree API instead of raw-body HMAC
  // (express.json() pre-parses the body, losing the raw string needed for sig check)
  async cashfreeWebhook(req: Request, res: Response) {
    try {
      const cfOrderId: string = req.body?.data?.order?.order_id || '';
      if (!cfOrderId) return res.json({ success: true });

      const payment = await prisma.payment.findFirst({ where: { cashfreeOrderId: cfOrderId } });
      if (!payment) return res.json({ success: true });

      const cfData = await cfFetch(`/orders/${cfOrderId}`).catch(() => null);
      if (!cfData) return res.json({ success: true });

      if (cfData.order_status === 'PAID') {
        const cfPaymentId = cfData.payments?.[0]?.cf_payment_id?.toString();
        await prisma.payment.update({
          where: { orderId: payment.orderId },
          data:  { status: 'PAID', ...(cfPaymentId && { cashfreePaymentId: cfPaymentId }), gatewayResponse: cfData },
        });
        await prisma.order.update({
          where: { id: payment.orderId },
          data:  { paymentStatus: 'PAID', status: 'CONFIRMED' },
        });
      } else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(cfData.order_status || '')) {
        await prisma.payment.update({
          where: { orderId: payment.orderId },
          data:  { status: 'FAILED', gatewayResponse: cfData },
        });
        await prisma.order.update({
          where: { id: payment.orderId },
          data:  { paymentStatus: 'FAILED' },
        });
      }
    } catch {
      // Always ACK to prevent Cashfree retries
    }
    return res.json({ success: true });
  }
}

export const paymentController = new PaymentController();

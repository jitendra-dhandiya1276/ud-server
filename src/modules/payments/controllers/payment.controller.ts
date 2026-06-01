import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { prisma } from '../../../config/prisma';
import { config } from '../../../config/env';
import { sendSuccess, sendError } from '../../../utils/response';

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

export class PaymentController {
  async createRazorpayOrder(req: Request, res: Response) {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(Number(order.total) * 100),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: order.id },
    });

    await prisma.payment.upsert({
      where: { orderId },
      create: { orderId, amount: order.total, method: 'RAZORPAY', razorpayOrderId: razorpayOrder.id },
      update: { razorpayOrderId: razorpayOrder.id },
    });

    return sendSuccess(res, {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: config.razorpay.keyId,
    }, 'Razorpay order created');
  }

  async verifyPayment(req: Request, res: Response) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (!req.user || order.userId !== req.user.userId) return sendError(res, 'Forbidden', 403);

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return sendError(res, 'Invalid payment signature', 400);
    }

    await prisma.payment.update({
      where: { orderId },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'PAID',
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
    });

    return sendSuccess(res, null, 'Payment verified successfully');
  }
}

export const paymentController = new PaymentController();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// ── Razorpay ────────────────────────────────────────────────────────
router.post('/razorpay/create', auth_middleware_1.authenticate, payment_controller_1.paymentController.createRazorpayOrder.bind(payment_controller_1.paymentController));
router.post('/razorpay/verify', auth_middleware_1.authenticate, payment_controller_1.paymentController.verifyPayment.bind(payment_controller_1.paymentController));
// ── Cashfree ────────────────────────────────────────────────────────
// Webhook is public — Cashfree calls it server-to-server with no user token
router.post('/cashfree/webhook', payment_controller_1.paymentController.cashfreeWebhook.bind(payment_controller_1.paymentController));
router.post('/cashfree/create', auth_middleware_1.authenticate, payment_controller_1.paymentController.createCashfreeOrder.bind(payment_controller_1.paymentController));
router.post('/cashfree/cod-deposit', auth_middleware_1.authenticate, payment_controller_1.paymentController.createCashfreeCodDeposit.bind(payment_controller_1.paymentController));
router.get('/cashfree/status/:orderId', auth_middleware_1.authenticate, payment_controller_1.paymentController.getCashfreePaymentStatus.bind(payment_controller_1.paymentController));
exports.default = router;

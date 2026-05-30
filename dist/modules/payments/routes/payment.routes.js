"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../controllers/payment.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.post('/razorpay/create', auth_middleware_1.authenticate, payment_controller_1.paymentController.createRazorpayOrder.bind(payment_controller_1.paymentController));
router.post('/razorpay/verify', auth_middleware_1.authenticate, payment_controller_1.paymentController.verifyPayment.bind(payment_controller_1.paymentController));
exports.default = router;

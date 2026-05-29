import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../../../middlewares/auth.middleware';

const router = Router();

router.post('/razorpay/create', authenticate, paymentController.createRazorpayOrder.bind(paymentController));
router.post('/razorpay/verify', authenticate, paymentController.verifyPayment.bind(paymentController));

export default router;

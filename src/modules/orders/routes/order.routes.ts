import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authenticate, isAdminOrSubAdmin } from '../../../middlewares/auth.middleware';

const router = Router();

// Customer routes
router.post('/', authenticate, orderController.createOrder.bind(orderController));
router.get('/my', authenticate, orderController.getMyOrders.bind(orderController));
router.get('/track/:orderNumber', orderController.trackOrder.bind(orderController));
router.get('/:id', authenticate, orderController.getOrderById.bind(orderController));
router.post('/:id/cancel', authenticate, orderController.cancelOrder.bind(orderController));

// Admin routes
router.get('/', authenticate, isAdminOrSubAdmin, orderController.getAllOrders.bind(orderController));
router.put('/:id/status', authenticate, isAdminOrSubAdmin, orderController.updateOrderStatus.bind(orderController));

export default router;

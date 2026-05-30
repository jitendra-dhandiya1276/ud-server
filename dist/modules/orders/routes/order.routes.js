"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Customer routes
router.post('/', auth_middleware_1.authenticate, order_controller_1.orderController.createOrder.bind(order_controller_1.orderController));
router.get('/my', auth_middleware_1.authenticate, order_controller_1.orderController.getMyOrders.bind(order_controller_1.orderController));
router.get('/track/:orderNumber', order_controller_1.orderController.trackOrder.bind(order_controller_1.orderController));
router.get('/:id', auth_middleware_1.authenticate, order_controller_1.orderController.getOrderById.bind(order_controller_1.orderController));
router.post('/:id/cancel', auth_middleware_1.authenticate, order_controller_1.orderController.cancelOrder.bind(order_controller_1.orderController));
// Admin routes
router.get('/', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, order_controller_1.orderController.getAllOrders.bind(order_controller_1.orderController));
router.put('/:id/status', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, order_controller_1.orderController.updateOrderStatus.bind(order_controller_1.orderController));
exports.default = router;

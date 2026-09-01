"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderController = exports.OrderController = void 0;
const order_service_1 = require("../services/order.service");
const response_1 = require("../../../utils/response");
class OrderController {
    async createOrder(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const order = await order_service_1.orderService.createOrder(req.user.userId, req.body);
        return (0, response_1.sendSuccess)(res, order, 'Order placed successfully', 201);
    }
    async getMyOrders(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { page, limit } = req.query;
        const result = await order_service_1.orderService.getUserOrders(req.user.userId, Number(page), Number(limit));
        return (0, response_1.sendPaginated)(res, result.orders, result.total, result.page, result.limit);
    }
    async getOrderById(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const order = await order_service_1.orderService.getOrderById(req.params.id, req.user.userId);
        return (0, response_1.sendSuccess)(res, order, 'Order fetched');
    }
    async trackOrder(req, res) {
        const order = await order_service_1.orderService.getOrderByNumber(req.params.orderNumber);
        return (0, response_1.sendSuccess)(res, order, 'Order tracked');
    }
    async cancelOrder(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { reason } = req.body;
        const order = await order_service_1.orderService.cancelOrder(req.params.id, req.user.userId, reason);
        return (0, response_1.sendSuccess)(res, order, 'Order cancelled');
    }
    // Admin
    async getOrderByIdAdmin(req, res) {
        // No userId: an admin reads any order. The role guard on the route is what
        // authorises it, which is why this is a separate endpoint rather than a
        // branch inside the customer-scoped one.
        const order = await order_service_1.orderService.getOrderById(req.params.id);
        return (0, response_1.sendSuccess)(res, order, 'Order fetched');
    }
    async getAllOrders(req, res) {
        const { page, limit, status, paymentStatus, search, startDate, endDate } = req.query;
        const result = await order_service_1.orderService.getAllOrders(Number(page), Number(limit), { status, paymentStatus, search, startDate, endDate });
        return (0, response_1.sendPaginated)(res, result.orders, result.total, result.page, result.limit);
    }
    async updateOrderStatus(req, res) {
        const { id } = req.params;
        const { status, trackingNumber, trackingUrl } = req.body;
        const order = await order_service_1.orderService.updateOrderStatus(id, status, trackingNumber, trackingUrl);
        return (0, response_1.sendSuccess)(res, order, 'Order status updated');
    }
}
exports.OrderController = OrderController;
exports.orderController = new OrderController();

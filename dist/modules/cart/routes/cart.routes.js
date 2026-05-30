"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cart_controller_1 = require("../controllers/cart.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const optionalAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (header)
        return (0, auth_middleware_1.authenticate)(req, res, next);
    return next();
};
router.get('/', optionalAuth, cart_controller_1.cartController.getCart.bind(cart_controller_1.cartController));
router.post('/add', optionalAuth, cart_controller_1.cartController.addItem.bind(cart_controller_1.cartController));
router.put('/item/:itemId', optionalAuth, cart_controller_1.cartController.updateItem.bind(cart_controller_1.cartController));
router.delete('/item/:itemId', optionalAuth, cart_controller_1.cartController.removeItem.bind(cart_controller_1.cartController));
router.delete('/clear', optionalAuth, cart_controller_1.cartController.clearCart.bind(cart_controller_1.cartController));
router.post('/coupon', optionalAuth, cart_controller_1.cartController.applyCoupon.bind(cart_controller_1.cartController));
exports.default = router;

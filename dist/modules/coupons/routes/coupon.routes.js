"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const coupon_controller_1 = require("../controllers/coupon.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Public
router.post('/validate', coupon_controller_1.couponController.validate.bind(coupon_controller_1.couponController));
router.get('/:code/check', coupon_controller_1.couponController.getByCode.bind(coupon_controller_1.couponController));
// Admin
router.get('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, coupon_controller_1.couponController.getAll.bind(coupon_controller_1.couponController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, coupon_controller_1.couponController.create.bind(coupon_controller_1.couponController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, coupon_controller_1.couponController.update.bind(coupon_controller_1.couponController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, coupon_controller_1.couponController.delete.bind(coupon_controller_1.couponController));
exports.default = router;

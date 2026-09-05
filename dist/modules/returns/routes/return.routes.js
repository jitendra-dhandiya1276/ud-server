"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const return_controller_1 = require("../controllers/return.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Customer — own requests only. There is deliberately no POST here: returns
// are raised on Instagram, per the published policy.
router.get('/my', auth_middleware_1.authenticate, return_controller_1.returnController.getMyReturns.bind(return_controller_1.returnController));
// Admin — static path before any parameterised sibling.
router.get('/', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, return_controller_1.returnController.getAll.bind(return_controller_1.returnController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, return_controller_1.returnController.create.bind(return_controller_1.returnController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, return_controller_1.returnController.update.bind(return_controller_1.returnController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, return_controller_1.returnController.remove.bind(return_controller_1.returnController));
exports.default = router;

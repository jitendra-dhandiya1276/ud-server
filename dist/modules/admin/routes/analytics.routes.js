"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.get('/dashboard', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, analytics_controller_1.analyticsController.getDashboard.bind(analytics_controller_1.analyticsController));
router.get('/revenue', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, analytics_controller_1.analyticsController.getRevenueReport.bind(analytics_controller_1.analyticsController));
exports.default = router;

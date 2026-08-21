"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_controller_1 = require("../controllers/category.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const upload_1 = require("../../../utils/upload");
const router = (0, express_1.Router)();
const upload = (0, upload_1.createUploader)('categories');
// Public
router.get('/', category_controller_1.categoryController.getAll.bind(category_controller_1.categoryController));
router.get('/featured', category_controller_1.categoryController.getFeatured.bind(category_controller_1.categoryController));
router.get('/nav-menu', category_controller_1.categoryController.getNavMenu.bind(category_controller_1.categoryController));
router.get('/parents', category_controller_1.categoryController.getParents.bind(category_controller_1.categoryController));
router.get('/home', category_controller_1.categoryController.getHomeCategories.bind(category_controller_1.categoryController));
router.get('/:slug', category_controller_1.categoryController.getBySlug.bind(category_controller_1.categoryController));
// Admin
// Before the parameterised routes, per the routing convention.
router.patch('/positions', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, category_controller_1.categoryController.updatePositions.bind(category_controller_1.categoryController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, upload.single('image'), category_controller_1.categoryController.create.bind(category_controller_1.categoryController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, upload.single('image'), category_controller_1.categoryController.update.bind(category_controller_1.categoryController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, category_controller_1.categoryController.delete.bind(category_controller_1.categoryController));
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_controller_1 = require("../controllers/product.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const upload_1 = require("../../../utils/upload");
const router = (0, express_1.Router)();
const upload = (0, upload_1.createUploader)('products');
// Public routes
router.get('/', product_controller_1.productController.getProducts.bind(product_controller_1.productController));
router.get('/featured', product_controller_1.productController.getFeaturedProducts.bind(product_controller_1.productController));
router.get('/trending', product_controller_1.productController.getTrendingProducts.bind(product_controller_1.productController));
router.get('/new-arrivals', product_controller_1.productController.getNewArrivals.bind(product_controller_1.productController));
router.get('/best-sellers', product_controller_1.productController.getBestSellers.bind(product_controller_1.productController));
router.get('/search', product_controller_1.productController.search.bind(product_controller_1.productController));
router.get('/:slug', product_controller_1.productController.getProductBySlug.bind(product_controller_1.productController));
// Admin routes
router.get('/admin/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, product_controller_1.productController.getProductById.bind(product_controller_1.productController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, upload.array('images', 10), product_controller_1.productController.createProduct.bind(product_controller_1.productController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, upload.array('images', 10), product_controller_1.productController.updateProduct.bind(product_controller_1.productController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, product_controller_1.productController.deleteProduct.bind(product_controller_1.productController));
// Variant routes
router.get('/:id/variants', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, product_controller_1.productController.getVariants.bind(product_controller_1.productController));
router.post('/:id/variants', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, product_controller_1.productController.createVariant.bind(product_controller_1.productController));
router.put('/:id/variants/:vid', auth_middleware_1.authenticate, auth_middleware_1.isAdminOrSubAdmin, product_controller_1.productController.updateVariant.bind(product_controller_1.productController));
router.delete('/:id/variants/:vid', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, product_controller_1.productController.deleteVariant.bind(product_controller_1.productController));
exports.default = router;

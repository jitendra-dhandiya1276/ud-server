"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const collection_controller_1 = require("../controllers/collection.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const upload_1 = require("../../../utils/upload");
const router = (0, express_1.Router)();
const upload = (0, upload_1.createUploader)('categories');
// Public
router.get('/', collection_controller_1.collectionController.getAll.bind(collection_controller_1.collectionController));
router.get('/:slug', collection_controller_1.collectionController.getBySlug.bind(collection_controller_1.collectionController));
// Admin
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, upload.single('image'), collection_controller_1.collectionController.create.bind(collection_controller_1.collectionController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, upload.single('image'), collection_controller_1.collectionController.update.bind(collection_controller_1.collectionController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, collection_controller_1.collectionController.delete.bind(collection_controller_1.collectionController));
// Collection ↔ Product management
router.get('/:id/products', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, collection_controller_1.collectionController.getProducts.bind(collection_controller_1.collectionController));
router.post('/:id/products', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, collection_controller_1.collectionController.addProduct.bind(collection_controller_1.collectionController));
router.delete('/:id/products/:productId', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, collection_controller_1.collectionController.removeProduct.bind(collection_controller_1.collectionController));
exports.default = router;

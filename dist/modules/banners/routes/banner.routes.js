"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const banner_controller_1 = require("../controllers/banner.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const upload_1 = require("../../../utils/upload");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const ONE_MB = 1 * 1024 * 1024;
const upload = (0, upload_1.createUploader)('banners', ONE_MB);
// Multer error handler for this route — turns LIMIT_FILE_SIZE into a 400
const handleUpload = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer_1.default.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'Image must be 1 MB or smaller.' });
        }
        if (err)
            return next(err);
        next();
    });
};
router.get('/type/:type', banner_controller_1.bannerController.getByType.bind(banner_controller_1.bannerController));
router.get('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.getAll.bind(banner_controller_1.bannerController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, handleUpload, banner_controller_1.bannerController.create.bind(banner_controller_1.bannerController));
router.put('/reorder', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.reorder.bind(banner_controller_1.bannerController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, handleUpload, banner_controller_1.bannerController.update.bind(banner_controller_1.bannerController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.delete.bind(banner_controller_1.bannerController));
exports.default = router;

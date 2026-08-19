"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const banner_controller_1 = require("../controllers/banner.controller");
const auth_middleware_1 = require("../../../middlewares/auth.middleware");
const upload_1 = require("../../../utils/upload");
const env_1 = require("../../../config/env");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
// Was 1 MB, which made it impossible to supply a hero sharp enough for a
// retina display. Masters are no longer downscaled to 1440px, so a large
// upload is now worth accepting — visitors still receive a viewport-sized
// AVIF from the derivative pipeline, not this file.
const MAX_BANNER_BYTES = env_1.config.upload.maxFileSize;
const upload = (0, upload_1.createUploader)('banners', MAX_BANNER_BYTES);
// Heroes span the viewport, so anything under 1440px wide is upscaled.
// The desktop hero spans the viewport (1440 floor). The portrait crop is
// shown at phone width, where 1080x1440 is the norm, so it gets its own.
const checkResolution = (0, upload_1.validateUploadResolution)('banners', { mobileImage: 800 });
const acceptImages = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 },
]);
// Multer error handler for this route — turns rejections into a clear 400.
// Uses acceptImages (fields) rather than single('image'), otherwise the
// mobileImage part is rejected as an unexpected field.
const handleUpload = (req, res, next) => {
    acceptImages(req, res, (err) => {
        if (err instanceof multer_1.default.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: `Image must be ${Math.round(MAX_BANNER_BYTES / 1048576)} MB or smaller.` });
            }
            // e.g. LIMIT_UNEXPECTED_FILE — say which field so it is actionable.
            return res.status(400).json({ success: false, message: `${err.message}${err.field ? ` ("${err.field}")` : ''}` });
        }
        if (err)
            return next(err);
        next();
    });
};
router.get('/type/:type', banner_controller_1.bannerController.getByType.bind(banner_controller_1.bannerController));
router.get('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.getAll.bind(banner_controller_1.bannerController));
router.post('/', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, handleUpload, checkResolution, banner_controller_1.bannerController.create.bind(banner_controller_1.bannerController));
router.put('/reorder', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.reorder.bind(banner_controller_1.bannerController));
router.put('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, handleUpload, checkResolution, banner_controller_1.bannerController.update.bind(banner_controller_1.bannerController));
router.delete('/:id', auth_middleware_1.authenticate, auth_middleware_1.isAdmin, banner_controller_1.bannerController.delete.bind(banner_controller_1.bannerController));
exports.default = router;

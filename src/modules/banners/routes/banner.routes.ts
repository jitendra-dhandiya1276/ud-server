import { Router, Request, Response, NextFunction } from 'express';
import { bannerController } from '../controllers/banner.controller';
import { authenticate, isAdmin } from '../../../middlewares/auth.middleware';
import { createUploader, validateUploadResolution } from '../../../utils/upload';
import { config } from '../../../config/env';
import multer from 'multer';

const router = Router();
// Was 1 MB, which made it impossible to supply a hero sharp enough for a
// retina display. Masters are no longer downscaled to 1440px, so a large
// upload is now worth accepting — visitors still receive a viewport-sized
// AVIF from the derivative pipeline, not this file.
const MAX_BANNER_BYTES = config.upload.maxFileSize;
const upload = createUploader('banners', MAX_BANNER_BYTES);
// Heroes span the viewport, so anything under 1440px wide is upscaled.
const checkResolution = validateUploadResolution('banners');

const acceptImages = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
]);

// Multer error handler for this route — turns LIMIT_FILE_SIZE into a 400
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: any) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: `Image must be ${Math.round(MAX_BANNER_BYTES / 1048576)} MB or smaller.` });
    }
    if (err) return next(err);
    next();
  });
};

router.get('/type/:type', bannerController.getByType.bind(bannerController));
router.get('/', authenticate, isAdmin, bannerController.getAll.bind(bannerController));
router.post('/', authenticate, isAdmin, handleUpload, checkResolution, bannerController.create.bind(bannerController));
router.put('/reorder', authenticate, isAdmin, bannerController.reorder.bind(bannerController));
router.put('/:id', authenticate, isAdmin, handleUpload, checkResolution, bannerController.update.bind(bannerController));
router.delete('/:id', authenticate, isAdmin, bannerController.delete.bind(bannerController));

export default router;

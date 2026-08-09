import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import controller from '../controllers/instagram-reels.controller';
import { authenticate, isAdminOrSubAdmin } from '../../../middlewares/auth.middleware';
import { createUploader, VIDEO_MIME_TYPES } from '../../../utils/upload';
import { config } from '../../../config/env';

const router = Router();

/**
 * Reels accept an optional video and poster image.
 *
 * Why this exists: Instagram has closed down oEmbed and its /embed/ iframe now
 * serves a login wall with no media in it, so a reel identified only by URL
 * renders as a dead grey box on the storefront. Hosting the clip ourselves is
 * the only way to actually show it, and the storefront already prefers
 * `videoUrl` (a real autoplaying <video>) over the embed when one is present.
 *
 * 60 MB covers a typical 15-30s vertical reel; images fall back to the normal
 * upload ceiling.
 */
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_SIZE || '62914560', 10);

const upload = createUploader('reels', MAX_VIDEO_BYTES, [
  ...VIDEO_MIME_TYPES,
  ...config.upload.allowedTypes,
]);

const acceptMedia = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

/** Turn multer rejections into a clear 400 rather than a generic 500. */
const handleMedia = (req: Request, res: Response, next: NextFunction) => {
  acceptMedia(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File is too large. Maximum video size is ${Math.round(MAX_VIDEO_BYTES / 1048576)} MB.`,
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    return next();
  });
};

// Public
router.get('/', controller.getActive.bind(controller));

// Admin
router.get('/admin', authenticate, isAdminOrSubAdmin, controller.getAll.bind(controller));
router.post('/', authenticate, isAdminOrSubAdmin, handleMedia, controller.create.bind(controller));
router.patch('/reorder', authenticate, isAdminOrSubAdmin, controller.reorder.bind(controller));
router.put('/:id', authenticate, isAdminOrSubAdmin, handleMedia, controller.update.bind(controller));
router.delete('/:id', authenticate, isAdminOrSubAdmin, controller.delete.bind(controller));

export default router;

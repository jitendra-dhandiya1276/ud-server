import { Router, Request, Response, NextFunction } from 'express';
import { bannerController } from '../controllers/banner.controller';
import { authenticate, isAdmin } from '../../../middlewares/auth.middleware';
import { createUploader } from '../../../utils/upload';
import multer from 'multer';

const router = Router();
const ONE_MB = 1 * 1024 * 1024;
const upload = createUploader('banners', ONE_MB);

// Multer error handler for this route — turns LIMIT_FILE_SIZE into a 400
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: any) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Image must be 1 MB or smaller.' });
    }
    if (err) return next(err);
    next();
  });
};

router.get('/type/:type', bannerController.getByType.bind(bannerController));
router.get('/', authenticate, isAdmin, bannerController.getAll.bind(bannerController));
router.post('/', authenticate, isAdmin, handleUpload, bannerController.create.bind(bannerController));
router.put('/reorder', authenticate, isAdmin, bannerController.reorder.bind(bannerController));
router.put('/:id', authenticate, isAdmin, handleUpload, bannerController.update.bind(bannerController));
router.delete('/:id', authenticate, isAdmin, bannerController.delete.bind(bannerController));

export default router;

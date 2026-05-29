import { Router } from 'express';
import { collectionController } from '../controllers/collection.controller';
import { authenticate, isAdmin } from '../../../middlewares/auth.middleware';
import { createUploader } from '../../../utils/upload';

const router = Router();
const upload = createUploader('categories');

// Public
router.get('/', collectionController.getAll.bind(collectionController));
router.get('/:slug', collectionController.getBySlug.bind(collectionController));

// Admin
router.post('/', authenticate, isAdmin, upload.single('image'), collectionController.create.bind(collectionController));
router.put('/:id', authenticate, isAdmin, upload.single('image'), collectionController.update.bind(collectionController));
router.delete('/:id', authenticate, isAdmin, collectionController.delete.bind(collectionController));

export default router;

import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { authenticate, isAdmin, isAdminOrSubAdmin } from '../../../middlewares/auth.middleware';
import { createUploader } from '../../../utils/upload';

const router = Router();
const upload = createUploader('categories');

router.get('/', categoryController.getAll.bind(categoryController));
router.get('/featured', categoryController.getFeatured.bind(categoryController));
router.get('/:slug', categoryController.getBySlug.bind(categoryController));

router.post('/', authenticate, isAdminOrSubAdmin, upload.single('image'), categoryController.create.bind(categoryController));
router.put('/:id', authenticate, isAdminOrSubAdmin, upload.single('image'), categoryController.update.bind(categoryController));
router.delete('/:id', authenticate, isAdmin, categoryController.delete.bind(categoryController));

export default router;

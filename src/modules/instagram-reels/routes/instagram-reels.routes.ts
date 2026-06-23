import { Router } from 'express';
import controller from '../controllers/instagram-reels.controller';
import { authenticate, isAdminOrSubAdmin } from '../../../middlewares/auth.middleware';

const router = Router();

// Public
router.get('/', controller.getActive.bind(controller));

// Admin
router.get('/admin', authenticate, isAdminOrSubAdmin, controller.getAll.bind(controller));
router.post('/', authenticate, isAdminOrSubAdmin, controller.create.bind(controller));
router.patch('/reorder', authenticate, isAdminOrSubAdmin, controller.reorder.bind(controller));
router.put('/:id', authenticate, isAdminOrSubAdmin, controller.update.bind(controller));
router.delete('/:id', authenticate, isAdminOrSubAdmin, controller.delete.bind(controller));

export default router;

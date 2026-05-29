import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticate, isAdmin } from '../../../middlewares/auth.middleware';

const router = Router();

router.get('/dashboard', authenticate, isAdmin, analyticsController.getDashboard.bind(analyticsController));
router.get('/revenue', authenticate, isAdmin, analyticsController.getRevenueReport.bind(analyticsController));

export default router;

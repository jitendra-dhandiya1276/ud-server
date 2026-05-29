import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../../../middlewares/auth.middleware';
import { validate } from '../../../middlewares/validate.middleware';
import {
  registerSchema, loginSchema, googleAuthSchema,
  forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
  refreshTokenSchema,
} from '../validators/auth.validators';

const router = Router();

router.post('/register', validate(registerSchema), authController.register.bind(authController));
router.post('/login', validate(loginSchema), authController.login.bind(authController));
router.post('/google', validate(googleAuthSchema), authController.googleAuth.bind(authController));
router.post('/refresh', validate(refreshTokenSchema), authController.refresh.bind(authController));
router.post('/logout', authenticate, authController.logout.bind(authController));
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword.bind(authController));
router.put('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword.bind(authController));
router.get('/me', authenticate, authController.me.bind(authController));

export default router;

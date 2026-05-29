import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess, sendError } from '../../../utils/response';

export class AuthController {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    return sendSuccess(res, result, 'Registration successful', 201);
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return sendSuccess(res, result, 'Login successful');
  }

  async googleAuth(req: Request, res: Response) {
    const { token } = req.body;
    const result = await authService.googleLogin(token);
    return sendSuccess(res, result, 'Google login successful');
  }

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    return sendSuccess(res, result, 'Tokens refreshed');
  }

  async logout(req: Request, res: Response) {
    if (req.user) await authService.logout(req.user.userId);
    return sendSuccess(res, null, 'Logged out successfully');
  }

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    await authService.forgotPassword(email);
    return sendSuccess(res, null, 'If an account exists, a reset link has been sent');
  }

  async resetPassword(req: Request, res: Response) {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    return sendSuccess(res, null, 'Password reset successfully');
  }

  async changePassword(req: Request, res: Response) {
    if (!req.user) return sendError(res, 'Unauthorized', 401);
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.userId, currentPassword, newPassword);
    return sendSuccess(res, null, 'Password changed successfully');
  }

  async me(req: Request, res: Response) {
    if (!req.user) return sendError(res, 'Unauthorized', 401);
    const { prisma } = await import('../../../config/prisma');
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatar: true, role: true, createdAt: true,
        isVerified: true, lastLoginAt: true,
      },
    });
    return sendSuccess(res, user, 'Profile fetched');
  }
}

export const authController = new AuthController();

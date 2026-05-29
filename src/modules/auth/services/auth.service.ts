import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../../config/prisma';
import { config } from '../../../config/env';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../utils/jwt';
import { AppError } from '../../../middlewares/error.middleware';
import { UserRole } from '@prisma/client';

const googleClient = new OAuth2Client(config.google.clientId);

export class AuthService {
  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 409);

    const hashedPassword = await bcrypt.hash(data.password, config.bcryptRounds);

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        isVerified: config.isDev,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    const tokens = this.generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, password: true, isActive: true },
    });

    if (!user || !user.password) throw new AppError('Invalid credentials', 401);
    if (!user.isActive) throw new AppError('Account disabled. Contact support.', 403);

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError('Invalid credentials', 401);

    const tokens = this.generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken, lastLoginAt: new Date() },
    });

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, ...tokens };
  }

  async googleLogin(token: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new AppError('Invalid Google token', 400);

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          firstName: payload.given_name || '',
          lastName: payload.family_name || '',
          googleId: payload.sub,
          avatar: payload.picture,
          isVerified: true,
          role: UserRole.CUSTOMER,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, avatar: payload.picture || user.avatar },
      });
    }

    if (!user.isActive) throw new AppError('Account disabled', 403);

    const tokens = this.generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken, lastLoginAt: new Date() },
    });

    return { user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }, ...tokens };
  }

  async refreshTokens(token: string) {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, refreshToken: true, isActive: true },
    });

    if (!user || !user.isActive || user.refreshToken !== token) {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokens = this.generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    return tokens;
  }

  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    return { token, email: user.email, name: user.firstName };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) throw new AppError('Invalid or expired reset token', 400);

    const hashedPassword = await bcrypt.hash(newPassword, config.bcryptRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
      },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user?.password) throw new AppError('Password not set', 400);

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError('Current password is incorrect', 400);

    const hashed = await bcrypt.hash(newPassword, config.bcryptRounds);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, refreshToken: null },
    });
  }

  private generateTokens(user: { id: string; email: string; role: UserRole }) {
    const payload = { userId: user.id, email: user.email, role: user.role };
    return {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };
  }
}

export const authService = new AuthService();

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../../config/prisma';
import { config } from '../../../config/env';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../utils/jwt';
import { AppError } from '../../../middlewares/error.middleware';
import { UserRole } from '@prisma/client';
import { generateOtp, hashOtp, otpMatches } from '../../../utils/otp';
import { sendMail, isMailConfigured } from '../../../config/mailer';
import { verifyEmailTemplate } from '../emails/verifyEmail.template';
import { logger } from '../../../utils/logger';

const googleClient = new OAuth2Client(config.google.clientId);

export class AuthService {
  /**
   * Sign-up creates the account but does NOT sign anyone in. A code goes to
   * the address given, and only entering that code produces tokens — so an
   * account can never reach a working state on an address its owner cannot
   * read. See `verifyEmail`.
   *
   * When email is not configured at all the account is created verified: a
   * misconfigured server should not silently make registration impossible.
   */
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
    const canVerify = isMailConfigured() && !config.isDev;

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        isVerified: !canVerify,
        ...(canVerify ? {} : { emailVerifiedAt: new Date() }),
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    if (!canVerify) {
      const tokens = this.generateTokens(user);
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      });
      return { user, ...tokens, requiresVerification: false as const };
    }

    await this.sendEmailOtp(user.id, user.email, user.firstName);
    return { user, requiresVerification: true as const };
  }

  // ─── Email verification ────────────────────────────────────────────────

  private static readonly OTP_TTL_MINUTES = 15;
  private static readonly OTP_RESEND_COOLDOWN_S = 60;
  private static readonly OTP_MAX_SENDS = 5;
  private static readonly OTP_MAX_ATTEMPTS = 5;

  /** Generate, store the hash, and mail the code. Never returns the code. */
  private async sendEmailOtp(userId: string, email: string, firstName: string) {
    const code = generateOtp(6);
    const expiresAt = new Date(Date.now() + AuthService.OTP_TTL_MINUTES * 60_000);

    const mail = verifyEmailTemplate({
      customerName: firstName || 'there',
      otp: code,
      minutesValid: AuthService.OTP_TTL_MINUTES,
      storeName: config.smtp.fromName,
    });

    // Sent before it is stored: a code the customer never received must not
    // become the one that works.
    await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailOtpHash: hashOtp(userId, code),
        emailOtpExpiresAt: expiresAt,
        emailOtpSentAt: new Date(),
        emailOtpSentCount: { increment: 1 },
        emailOtpAttempts: 0,
      },
    });

    logger.info('Verification code sent', { userId });
    return expiresAt;
  }

  /** The code is what signs them in — verifying and logging in are one step. */
  async verifyEmail(email: string, submitted: string) {
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        isVerified: true, isActive: true,
        emailOtpHash: true, emailOtpExpiresAt: true, emailOtpAttempts: true,
      },
    });

    if (!user) throw new AppError('No account found for that email', 404);
    if (!user.isActive) throw new AppError('Account disabled. Contact support.', 403);
    if (user.isVerified) throw new AppError('This email is already verified. Please sign in.', 400);
    if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
      throw new AppError('No verification code has been sent. Request a new one.', 400);
    }
    if (user.emailOtpExpiresAt.getTime() < Date.now()) {
      throw new AppError('That code has expired. Request a new one.', 400);
    }
    if (user.emailOtpAttempts >= AuthService.OTP_MAX_ATTEMPTS) {
      throw new AppError('Too many incorrect codes. Request a new one.', 429);
    }

    const code = String(submitted ?? '').replace(/\D/g, '');
    if (code.length !== 6) throw new AppError('Enter the 6-digit code from your email.', 400);

    if (!otpMatches(user.id, code, user.emailOtpHash)) {
      const { emailOtpAttempts } = await prisma.user.update({
        where: { id: user.id },
        data: { emailOtpAttempts: { increment: 1 } },
        select: { emailOtpAttempts: true },
      });
      const left = Math.max(0, AuthService.OTP_MAX_ATTEMPTS - emailOtpAttempts);
      throw new AppError(
        left > 0
          ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'That code is not right, and there are no tries left. Request a new one.',
        400,
      );
    }

    const account = {
      id: user.id, email: user.email, firstName: user.firstName,
      lastName: user.lastName, role: user.role,
    };
    const tokens = this.generateTokens(account);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        emailVerifiedAt: new Date(),
        refreshToken: tokens.refreshToken,
        lastLoginAt: new Date(),
        // Spent. Keeping the hash would let the same code be replayed.
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        emailOtpAttempts: 0,
      },
    });

    logger.info('Email verified', { userId: user.id });
    return { user: account, ...tokens };
  }

  /** Re-send, rate limited. Says nothing about whether the address exists. */
  async resendEmailOtp(email: string) {
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, isVerified: true, isActive: true,
        emailOtpSentAt: true, emailOtpSentCount: true,
      },
    });

    // Deliberately vague: confirming which addresses have accounts would turn
    // this endpoint into a way to enumerate the customer list.
    if (!user || user.isVerified || !user.isActive) return { sent: false };

    if (user.emailOtpSentAt) {
      const waited = Date.now() - user.emailOtpSentAt.getTime();
      if (waited < AuthService.OTP_RESEND_COOLDOWN_S * 1000) {
        const seconds = Math.ceil((AuthService.OTP_RESEND_COOLDOWN_S * 1000 - waited) / 1000);
        throw new AppError(`A code was just sent. Try again in ${seconds}s.`, 429);
      }
    }
    if (user.emailOtpSentCount >= AuthService.OTP_MAX_SENDS) {
      throw new AppError('Too many codes requested. Contact support.', 429);
    }

    await this.sendEmailOtp(user.id, user.email, user.firstName);
    return { sent: true };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        password: true, isActive: true, isVerified: true,
      },
    });

    if (!user || !user.password) throw new AppError('Invalid credentials', 401);
    if (!user.isActive) throw new AppError('Account disabled. Contact support.', 403);

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError('Invalid credentials', 401);

    // Checked only after the password, so this never reveals whether an
    // address has an account to someone who cannot already sign in.
    if (!user.isVerified) {
      const err = new AppError('Please verify your email to continue.', 403);
      (err as any).code = 'EMAIL_NOT_VERIFIED';
      (err as any).email = user.email;
      throw err;
    }

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

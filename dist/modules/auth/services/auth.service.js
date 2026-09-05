"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const google_auth_library_1 = require("google-auth-library");
const prisma_1 = require("../../../config/prisma");
const env_1 = require("../../../config/env");
const jwt_1 = require("../../../utils/jwt");
const error_middleware_1 = require("../../../middlewares/error.middleware");
const client_1 = require("@prisma/client");
const otp_1 = require("../../../utils/otp");
const mailer_1 = require("../../../config/mailer");
const verifyEmail_template_1 = require("../emails/verifyEmail.template");
const logger_1 = require("../../../utils/logger");
const googleClient = new google_auth_library_1.OAuth2Client(env_1.config.google.clientId);
class AuthService {
    /**
     * Sign-up creates the account but does NOT sign anyone in. A code goes to
     * the address given, and only entering that code produces tokens — so an
     * account can never reach a working state on an address its owner cannot
     * read. See `verifyEmail`.
     *
     * When email is not configured at all the account is created verified: a
     * misconfigured server should not silently make registration impossible.
     */
    async register(data) {
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
        if (existing)
            throw new error_middleware_1.AppError('Email already registered', 409);
        const hashedPassword = await bcryptjs_1.default.hash(data.password, env_1.config.bcryptRounds);
        const canVerify = (0, mailer_1.isMailConfigured)() && !env_1.config.isDev;
        const user = await prisma_1.prisma.user.create({
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
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: tokens.refreshToken },
            });
            return { user, ...tokens, requiresVerification: false };
        }
        await this.sendEmailOtp(user.id, user.email, user.firstName);
        return { user, requiresVerification: true };
    }
    /** Generate, store the hash, and mail the code. Never returns the code. */
    async sendEmailOtp(userId, email, firstName) {
        const code = (0, otp_1.generateOtp)(6);
        const expiresAt = new Date(Date.now() + AuthService.OTP_TTL_MINUTES * 60000);
        const mail = (0, verifyEmail_template_1.verifyEmailTemplate)({
            customerName: firstName || 'there',
            otp: code,
            minutesValid: AuthService.OTP_TTL_MINUTES,
            storeName: env_1.config.smtp.fromName,
        });
        // Sent before it is stored: a code the customer never received must not
        // become the one that works.
        await (0, mailer_1.sendMail)({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                emailOtpHash: (0, otp_1.hashOtp)(userId, code),
                emailOtpExpiresAt: expiresAt,
                emailOtpSentAt: new Date(),
                emailOtpSentCount: { increment: 1 },
                emailOtpAttempts: 0,
            },
        });
        logger_1.logger.info('Verification code sent', { userId });
        return expiresAt;
    }
    /** The code is what signs them in — verifying and logging in are one step. */
    async verifyEmail(email, submitted) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email, deletedAt: null },
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true,
                isVerified: true, isActive: true,
                emailOtpHash: true, emailOtpExpiresAt: true, emailOtpAttempts: true,
            },
        });
        if (!user)
            throw new error_middleware_1.AppError('No account found for that email', 404);
        if (!user.isActive)
            throw new error_middleware_1.AppError('Account disabled. Contact support.', 403);
        if (user.isVerified)
            throw new error_middleware_1.AppError('This email is already verified. Please sign in.', 400);
        if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
            throw new error_middleware_1.AppError('No verification code has been sent. Request a new one.', 400);
        }
        if (user.emailOtpExpiresAt.getTime() < Date.now()) {
            throw new error_middleware_1.AppError('That code has expired. Request a new one.', 400);
        }
        if (user.emailOtpAttempts >= AuthService.OTP_MAX_ATTEMPTS) {
            throw new error_middleware_1.AppError('Too many incorrect codes. Request a new one.', 429);
        }
        const code = String(submitted ?? '').replace(/\D/g, '');
        if (code.length !== 6)
            throw new error_middleware_1.AppError('Enter the 6-digit code from your email.', 400);
        if (!(0, otp_1.otpMatches)(user.id, code, user.emailOtpHash)) {
            const { emailOtpAttempts } = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { emailOtpAttempts: { increment: 1 } },
                select: { emailOtpAttempts: true },
            });
            const left = Math.max(0, AuthService.OTP_MAX_ATTEMPTS - emailOtpAttempts);
            throw new error_middleware_1.AppError(left > 0
                ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
                : 'That code is not right, and there are no tries left. Request a new one.', 400);
        }
        const account = {
            id: user.id, email: user.email, firstName: user.firstName,
            lastName: user.lastName, role: user.role,
        };
        const tokens = this.generateTokens(account);
        await prisma_1.prisma.user.update({
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
        logger_1.logger.info('Email verified', { userId: user.id });
        return { user: account, ...tokens };
    }
    /** Re-send, rate limited. Says nothing about whether the address exists. */
    async resendEmailOtp(email) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email, deletedAt: null },
            select: {
                id: true, email: true, firstName: true, isVerified: true, isActive: true,
                emailOtpSentAt: true, emailOtpSentCount: true,
            },
        });
        // Deliberately vague: confirming which addresses have accounts would turn
        // this endpoint into a way to enumerate the customer list.
        if (!user || user.isVerified || !user.isActive)
            return { sent: false };
        if (user.emailOtpSentAt) {
            const waited = Date.now() - user.emailOtpSentAt.getTime();
            if (waited < AuthService.OTP_RESEND_COOLDOWN_S * 1000) {
                const seconds = Math.ceil((AuthService.OTP_RESEND_COOLDOWN_S * 1000 - waited) / 1000);
                throw new error_middleware_1.AppError(`A code was just sent. Try again in ${seconds}s.`, 429);
            }
        }
        if (user.emailOtpSentCount >= AuthService.OTP_MAX_SENDS) {
            throw new error_middleware_1.AppError('Too many codes requested. Contact support.', 429);
        }
        await this.sendEmailOtp(user.id, user.email, user.firstName);
        return { sent: true };
    }
    async login(email, password) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email, deletedAt: null },
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true,
                password: true, isActive: true, isVerified: true,
            },
        });
        if (!user || !user.password)
            throw new error_middleware_1.AppError('Invalid credentials', 401);
        if (!user.isActive)
            throw new error_middleware_1.AppError('Account disabled. Contact support.', 403);
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword)
            throw new error_middleware_1.AppError('Invalid credentials', 401);
        // Checked only after the password, so this never reveals whether an
        // address has an account to someone who cannot already sign in.
        if (!user.isVerified) {
            const err = new error_middleware_1.AppError('Please verify your email to continue.', 403);
            err.code = 'EMAIL_NOT_VERIFIED';
            err.email = user.email;
            throw err;
        }
        const tokens = this.generateTokens(user);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken, lastLoginAt: new Date() },
        });
        const { password: _, ...userWithoutPassword } = user;
        return { user: userWithoutPassword, ...tokens };
    }
    async googleLogin(token) {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: env_1.config.google.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email)
            throw new error_middleware_1.AppError('Invalid Google token', 400);
        let user = await prisma_1.prisma.user.findUnique({
            where: { email: payload.email },
        });
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    email: payload.email,
                    firstName: payload.given_name || '',
                    lastName: payload.family_name || '',
                    googleId: payload.sub,
                    avatar: payload.picture,
                    isVerified: true,
                    role: client_1.UserRole.CUSTOMER,
                },
            });
        }
        else if (!user.googleId) {
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { googleId: payload.sub, avatar: payload.picture || user.avatar },
            });
        }
        if (!user.isActive)
            throw new error_middleware_1.AppError('Account disabled', 403);
        const tokens = this.generateTokens(user);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken, lastLoginAt: new Date() },
        });
        return { user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }, ...tokens };
    }
    async refreshTokens(token) {
        let payload;
        try {
            payload = (0, jwt_1.verifyRefreshToken)(token);
        }
        catch {
            throw new error_middleware_1.AppError('Invalid refresh token', 401);
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, email: true, role: true, refreshToken: true, isActive: true },
        });
        if (!user || !user.isActive || user.refreshToken !== token) {
            throw new error_middleware_1.AppError('Invalid refresh token', 401);
        }
        const tokens = this.generateTokens(user);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken },
        });
        return tokens;
    }
    async logout(userId) {
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }
    async forgotPassword(email) {
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user)
            return;
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { passwordResetToken: token, passwordResetExpiry: expiry },
        });
        return { token, email: user.email, name: user.firstName };
    }
    async resetPassword(token, newPassword) {
        const user = await prisma_1.prisma.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpiry: { gt: new Date() },
            },
        });
        if (!user)
            throw new error_middleware_1.AppError('Invalid or expired reset token', 400);
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, env_1.config.bcryptRounds);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                passwordResetExpiry: null,
                refreshToken: null,
            },
        });
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { password: true },
        });
        if (!user?.password)
            throw new error_middleware_1.AppError('Password not set', 400);
        const valid = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!valid)
            throw new error_middleware_1.AppError('Current password is incorrect', 400);
        const hashed = await bcryptjs_1.default.hash(newPassword, env_1.config.bcryptRounds);
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { password: hashed, refreshToken: null },
        });
    }
    generateTokens(user) {
        const payload = { userId: user.id, email: user.email, role: user.role };
        return {
            accessToken: (0, jwt_1.signAccessToken)(payload),
            refreshToken: (0, jwt_1.signRefreshToken)(payload),
        };
    }
}
exports.AuthService = AuthService;
// ─── Email verification ────────────────────────────────────────────────
AuthService.OTP_TTL_MINUTES = 15;
AuthService.OTP_RESEND_COOLDOWN_S = 60;
AuthService.OTP_MAX_SENDS = 5;
AuthService.OTP_MAX_ATTEMPTS = 5;
exports.authService = new AuthService();

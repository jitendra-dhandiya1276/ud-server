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
const googleClient = new google_auth_library_1.OAuth2Client(env_1.config.google.clientId);
class AuthService {
    async register(data) {
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
        if (existing)
            throw new error_middleware_1.AppError('Email already registered', 409);
        const hashedPassword = await bcryptjs_1.default.hash(data.password, env_1.config.bcryptRounds);
        const user = await prisma_1.prisma.user.create({
            data: {
                ...data,
                password: hashedPassword,
                isVerified: env_1.config.isDev,
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });
        const tokens = this.generateTokens(user);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken },
        });
        return { user, ...tokens };
    }
    async login(email, password) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email, deletedAt: null },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, password: true, isActive: true },
        });
        if (!user || !user.password)
            throw new error_middleware_1.AppError('Invalid credentials', 401);
        if (!user.isActive)
            throw new error_middleware_1.AppError('Account disabled. Contact support.', 403);
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword)
            throw new error_middleware_1.AppError('Invalid credentials', 401);
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
exports.authService = new AuthService();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const response_1 = require("../../../utils/response");
const prisma_1 = require("../../../config/prisma");
class AuthController {
    /**
     * Ask for a sign-in code. Same endpoint whether the address is new or
     * returning — the client does not need to know which, and asking would leak
     * whether an address has an account.
     */
    async requestOtp(req, res) {
        const result = await auth_service_1.authService.requestOtp(req.body);
        return (0, response_1.sendSuccess)(res, result, 'Code sent to your email');
    }
    /** The code is the sign-in. For a new address it also creates the account. */
    async verifyOtp(req, res) {
        const { email, otp } = req.body;
        const result = await auth_service_1.authService.verifyOtp(email, otp);
        return (0, response_1.sendSuccess)(res, result, 'Signed in');
    }
    async login(req, res) {
        const { email, password } = req.body;
        const result = await auth_service_1.authService.login(email, password);
        return (0, response_1.sendSuccess)(res, result, 'Login successful');
    }
    async googleAuth(req, res) {
        const { token } = req.body;
        const result = await auth_service_1.authService.googleLogin(token);
        return (0, response_1.sendSuccess)(res, result, 'Google login successful');
    }
    async refresh(req, res) {
        const { refreshToken } = req.body;
        const result = await auth_service_1.authService.refreshTokens(refreshToken);
        return (0, response_1.sendSuccess)(res, result, 'Tokens refreshed');
    }
    async logout(req, res) {
        if (req.user)
            await auth_service_1.authService.logout(req.user.userId);
        return (0, response_1.sendSuccess)(res, null, 'Logged out successfully');
    }
    async forgotPassword(req, res) {
        const { email } = req.body;
        await auth_service_1.authService.forgotPassword(email);
        return (0, response_1.sendSuccess)(res, null, 'If an account exists, a reset link has been sent');
    }
    async resetPassword(req, res) {
        const { token, password } = req.body;
        await auth_service_1.authService.resetPassword(token, password);
        return (0, response_1.sendSuccess)(res, null, 'Password reset successfully');
    }
    async changePassword(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { currentPassword, newPassword } = req.body;
        await auth_service_1.authService.changePassword(req.user.userId, currentPassword, newPassword);
        return (0, response_1.sendSuccess)(res, null, 'Password changed successfully');
    }
    async me(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, avatar: true, role: true, createdAt: true,
                isVerified: true, lastLoginAt: true,
            },
        });
        return (0, response_1.sendSuccess)(res, user, 'Profile fetched');
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOtpSchema = exports.requestOtpSchema = exports.refreshTokenSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.googleAuthSchema = exports.loginSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.loginSchema = joi_1.default.object({
    email: joi_1.default.string().email().lowercase().required(),
    password: joi_1.default.string().required(),
});
exports.googleAuthSchema = joi_1.default.object({
    token: joi_1.default.string().required(),
});
exports.forgotPasswordSchema = joi_1.default.object({
    email: joi_1.default.string().email().lowercase().required(),
});
exports.resetPasswordSchema = joi_1.default.object({
    token: joi_1.default.string().required(),
    password: joi_1.default.string().min(8).max(100).required(),
});
exports.changePasswordSchema = joi_1.default.object({
    currentPassword: joi_1.default.string().required(),
    newPassword: joi_1.default.string().min(8).max(100).required(),
});
exports.refreshTokenSchema = joi_1.default.object({
    refreshToken: joi_1.default.string().required(),
});
exports.requestOtpSchema = joi_1.default.object({
    email: joi_1.default.string().email().lowercase().trim().required(),
    // Only needed the first time an address is seen; the service decides.
    firstName: joi_1.default.string().trim().min(2).max(50).optional().allow(''),
    lastName: joi_1.default.string().trim().max(50).optional().allow(''),
    phone: joi_1.default.string().trim().pattern(/^[6-9]\d{9}$/).optional().allow('').messages({
        'string.pattern.base': 'Enter a valid 10-digit mobile number',
    }),
});
exports.verifyOtpSchema = joi_1.default.object({
    email: joi_1.default.string().email().lowercase().trim().required(),
    otp: joi_1.default.string().trim().pattern(/^\d{6}$/).required().messages({
        'string.pattern.base': 'Enter the 6-digit code from your email',
    }),
});

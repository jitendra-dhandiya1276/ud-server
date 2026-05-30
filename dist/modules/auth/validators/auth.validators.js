"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTokenSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.googleAuthSchema = exports.loginSchema = exports.registerSchema = void 0;
const joi_1 = __importDefault(require("joi"));
exports.registerSchema = joi_1.default.object({
    firstName: joi_1.default.string().min(2).max(50).required(),
    lastName: joi_1.default.string().min(2).max(50).required(),
    email: joi_1.default.string().email().lowercase().required(),
    password: joi_1.default.string().min(8).max(100).required(),
    phone: joi_1.default.string().pattern(/^[6-9]\d{9}$/).optional(),
});
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

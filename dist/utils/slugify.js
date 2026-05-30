"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationParams = exports.generateOrderNumber = exports.createSlug = void 0;
const slugify_1 = __importDefault(require("slugify"));
const createSlug = (text) => {
    return (0, slugify_1.default)(text, {
        lower: true,
        strict: true,
        trim: true,
    });
};
exports.createSlug = createSlug;
const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
};
exports.generateOrderNumber = generateOrderNumber;
const paginationParams = (page, limit) => {
    const p = Math.max(1, parseInt(String(page || 1), 10));
    const l = Math.min(100, Math.max(1, parseInt(String(limit || 20), 10)));
    return { page: p, limit: l, skip: (p - 1) * l };
};
exports.paginationParams = paginationParams;

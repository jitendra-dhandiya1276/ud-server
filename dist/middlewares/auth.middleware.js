"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperAdmin = exports.isAdminOrSubAdmin = exports.isAdmin = exports.authorize = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
const prisma_1 = require("../config/prisma");
const client_1 = require("@prisma/client");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return (0, response_1.sendError)(res, 'No token provided', 401);
        }
        const token = authHeader.split(' ')[1];
        const payload = (0, jwt_1.verifyAccessToken)(token);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId, isActive: true, deletedAt: null },
            select: { id: true, email: true, role: true, isActive: true },
        });
        if (!user)
            return (0, response_1.sendError)(res, 'User not found or inactive', 401);
        req.user = { ...payload, dbRole: user.role };
        return next();
    }
    catch {
        return (0, response_1.sendError)(res, 'Invalid or expired token', 401);
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!roles.includes(req.user.dbRole)) {
            return (0, response_1.sendError)(res, 'Forbidden: insufficient permissions', 403);
        }
        return next();
    };
};
exports.authorize = authorize;
exports.isAdmin = (0, exports.authorize)(client_1.UserRole.ADMIN, client_1.UserRole.SUPER_ADMIN);
exports.isAdminOrSubAdmin = (0, exports.authorize)(client_1.UserRole.ADMIN, client_1.UserRole.SUPER_ADMIN, client_1.UserRole.SUB_ADMIN);
exports.isSuperAdmin = (0, exports.authorize)(client_1.UserRole.SUPER_ADMIN);

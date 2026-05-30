"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = exports.UserController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const upload_1 = require("../../../utils/upload");
const slugify_1 = require("../../../utils/slugify");
class UserController {
    async updateProfile(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { firstName, lastName, phone } = req.body;
        const file = req.file;
        const data = { firstName, lastName, phone };
        if (file)
            data.avatar = (0, upload_1.getImageUrl)(file.path);
        const user = await prisma_1.prisma.user.update({
            where: { id: req.user.userId },
            data,
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, role: true },
        });
        return (0, response_1.sendSuccess)(res, user, 'Profile updated');
    }
    // Addresses
    async getAddresses(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const addresses = await prisma_1.prisma.address.findMany({ where: { userId: req.user.userId } });
        return (0, response_1.sendSuccess)(res, addresses, 'Addresses fetched');
    }
    async addAddress(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const data = { ...req.body, userId: req.user.userId };
        if (data.isDefault) {
            await prisma_1.prisma.address.updateMany({ where: { userId: req.user.userId }, data: { isDefault: false } });
        }
        const address = await prisma_1.prisma.address.create({ data });
        return (0, response_1.sendSuccess)(res, address, 'Address added', 201);
    }
    async updateAddress(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { id } = req.params;
        if (req.body.isDefault) {
            await prisma_1.prisma.address.updateMany({ where: { userId: req.user.userId }, data: { isDefault: false } });
        }
        const address = await prisma_1.prisma.address.update({
            where: { id, userId: req.user.userId },
            data: req.body,
        });
        return (0, response_1.sendSuccess)(res, address, 'Address updated');
    }
    async deleteAddress(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { id } = req.params;
        await prisma_1.prisma.address.delete({ where: { id, userId: req.user.userId } });
        return (0, response_1.sendSuccess)(res, null, 'Address deleted');
    }
    // Recently viewed
    async getRecentlyViewed(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const items = await prisma_1.prisma.recentlyViewed.findMany({
            where: { userId: req.user.userId },
            include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } },
            orderBy: { viewedAt: 'desc' },
            take: 20,
        });
        return (0, response_1.sendSuccess)(res, items, 'Recently viewed');
    }
    async addRecentlyViewed(req, res) {
        if (!req.user)
            return (0, response_1.sendSuccess)(res, null, '');
        const { productId } = req.body;
        await prisma_1.prisma.recentlyViewed.upsert({
            where: { userId_productId: { userId: req.user.userId, productId } },
            create: { userId: req.user.userId, productId },
            update: { viewedAt: new Date() },
        });
        return (0, response_1.sendSuccess)(res, null, '');
    }
    // Notifications
    async getNotifications(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const notifications = await prisma_1.prisma.notification.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        return (0, response_1.sendSuccess)(res, notifications, 'Notifications fetched');
    }
    async markNotificationsRead(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        await prisma_1.prisma.notification.updateMany({
            where: { userId: req.user.userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });
        return (0, response_1.sendSuccess)(res, null, 'Marked as read');
    }
    // Admin
    async getAllUsers(req, res) {
        const { page, limit, search, role } = req.query;
        const { skip } = (0, slugify_1.paginationParams)(page, limit);
        const where = { deletedAt: null };
        if (role)
            where.role = role;
        if (search) {
            where.OR = [
                { email: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
            ];
        }
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                where,
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, isActive: true, avatar: true, createdAt: true, lastLoginAt: true, _count: { select: { orders: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit || '20'),
            }),
            prisma_1.prisma.user.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, users, total, parseInt(page || '1'), parseInt(limit || '20'));
    }
    async updateUser(req, res) {
        const { id } = req.params;
        const user = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!user)
            return (0, response_1.sendError)(res, 'User not found', 404);
        const { password, role, ...allowed } = req.body;
        const updated = await prisma_1.prisma.user.update({ where: { id }, data: allowed });
        return (0, response_1.sendSuccess)(res, updated, 'User updated');
    }
    async toggleUserStatus(req, res) {
        const { id } = req.params;
        const user = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!user)
            return (0, response_1.sendError)(res, 'User not found', 404);
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: { isActive: !user.isActive },
        });
        return (0, response_1.sendSuccess)(res, updated, `User ${updated.isActive ? 'activated' : 'deactivated'}`);
    }
}
exports.UserController = UserController;
exports.userController = new UserController();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewController = exports.ReviewController = void 0;
const prisma_1 = require("../../../config/prisma");
const response_1 = require("../../../utils/response");
const slugify_1 = require("../../../utils/slugify");
class ReviewController {
    async getProductReviews(req, res) {
        const { productId } = req.params;
        const { page, limit } = req.query;
        const { skip } = (0, slugify_1.paginationParams)(page, limit);
        const [reviews, total] = await Promise.all([
            prisma_1.prisma.review.findMany({
                where: { productId, isApproved: true },
                include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit || '10'),
            }),
            prisma_1.prisma.review.count({ where: { productId, isApproved: true } }),
        ]);
        return (0, response_1.sendPaginated)(res, reviews, total, parseInt(page || '1'), parseInt(limit || '10'));
    }
    async createReview(req, res) {
        if (!req.user)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { productId, rating, title, body } = req.body;
        const existing = await prisma_1.prisma.review.findFirst({
            where: { productId, userId: req.user.userId },
        });
        if (existing)
            return (0, response_1.sendError)(res, 'You have already reviewed this product', 409);
        const review = await prisma_1.prisma.review.create({
            data: { productId, userId: req.user.userId, rating, title, body },
        });
        const stats = await prisma_1.prisma.review.aggregate({
            where: { productId, isApproved: true },
            _avg: { rating: true },
            _count: true,
        });
        await prisma_1.prisma.product.update({
            where: { id: productId },
            data: {
                avgRating: stats._avg.rating || 0,
                totalReviews: stats._count,
            },
        });
        return (0, response_1.sendSuccess)(res, review, 'Review submitted', 201);
    }
    async getAllReviews(req, res) {
        const { page, limit, status } = req.query;
        const { skip } = (0, slugify_1.paginationParams)(page, limit);
        const where = {};
        if (status)
            where.status = status;
        const [reviews, total] = await Promise.all([
            prisma_1.prisma.review.findMany({
                where,
                include: {
                    user: { select: { firstName: true, lastName: true, email: true } },
                    product: { select: { name: true, slug: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit || '20'),
            }),
            prisma_1.prisma.review.count({ where }),
        ]);
        return (0, response_1.sendPaginated)(res, reviews, total, parseInt(page || '1'), parseInt(limit || '20'));
    }
    async updateReview(req, res) {
        const { id } = req.params;
        const { isApproved, status, ...rest } = req.body;
        const data = { ...rest };
        if (isApproved !== undefined)
            data.isApproved = isApproved;
        if (status !== undefined)
            data.status = status;
        const review = await prisma_1.prisma.review.update({ where: { id }, data });
        if (isApproved !== undefined) {
            const stats = await prisma_1.prisma.review.aggregate({
                where: { productId: review.productId, isApproved: true },
                _avg: { rating: true },
                _count: true,
            });
            await prisma_1.prisma.product.update({
                where: { id: review.productId },
                data: { avgRating: stats._avg.rating || 0, totalReviews: stats._count },
            });
        }
        return (0, response_1.sendSuccess)(res, review, 'Review updated');
    }
    async deleteReview(req, res) {
        const { id } = req.params;
        const review = await prisma_1.prisma.review.findUnique({ where: { id } });
        if (!review)
            return (0, response_1.sendError)(res, 'Review not found', 404);
        await prisma_1.prisma.review.delete({ where: { id } });
        const stats = await prisma_1.prisma.review.aggregate({
            where: { productId: review.productId, isApproved: true },
            _avg: { rating: true },
            _count: true,
        });
        await prisma_1.prisma.product.update({
            where: { id: review.productId },
            data: { avgRating: stats._avg.rating || 0, totalReviews: stats._count },
        });
        return (0, response_1.sendSuccess)(res, null, 'Review deleted');
    }
    async updateReviewStatus(req, res) {
        const { id } = req.params;
        const { status, isApproved } = req.body;
        const review = await prisma_1.prisma.review.update({
            where: { id },
            data: { status, isApproved },
        });
        if (isApproved !== undefined) {
            const stats = await prisma_1.prisma.review.aggregate({
                where: { productId: review.productId, isApproved: true },
                _avg: { rating: true },
                _count: true,
            });
            await prisma_1.prisma.product.update({
                where: { id: review.productId },
                data: { avgRating: stats._avg.rating || 0, totalReviews: stats._count },
            });
        }
        return (0, response_1.sendSuccess)(res, review, 'Review updated');
    }
}
exports.ReviewController = ReviewController;
exports.reviewController = new ReviewController();

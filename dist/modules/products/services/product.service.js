"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = exports.ProductService = void 0;
const prisma_1 = require("../../../config/prisma");
const error_middleware_1 = require("../../../middlewares/error.middleware");
const slugify_1 = require("../../../utils/slugify");
const slugify_2 = require("../../../utils/slugify");
class ProductService {
    async getProducts(filters) {
        const { page, limit, skip } = (0, slugify_2.paginationParams)(filters.page, filters.limit);
        const where = {
            isActive: true,
            deletedAt: null,
        };
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search } },
                { description: { contains: filters.search } },
                { brand: { contains: filters.search } },
                { sku: { contains: filters.search } },
            ];
        }
        if (filters.categoryId)
            where.categoryId = filters.categoryId;
        if (filters.categorySlug)
            where.category = { slug: filters.categorySlug };
        if (filters.collectionSlug)
            where.collections = { some: { collection: { slug: filters.collectionSlug } } };
        if (filters.isFeatured !== undefined)
            where.isFeatured = filters.isFeatured;
        if (filters.isTrending !== undefined)
            where.isTrending = filters.isTrending;
        if (filters.isNewArrival !== undefined)
            where.isNewArrival = filters.isNewArrival;
        if (filters.isBestSeller !== undefined)
            where.isBestSeller = filters.isBestSeller;
        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
            where.OR = [
                {
                    salePrice: {
                        gte: filters.minPrice,
                        lte: filters.maxPrice,
                    },
                },
                {
                    AND: [
                        { salePrice: null },
                        {
                            basePrice: {
                                gte: filters.minPrice,
                                lte: filters.maxPrice,
                            },
                        },
                    ],
                },
            ];
        }
        if (filters.brands?.length)
            where.brand = { in: filters.brands };
        if (filters.inStock)
            where.stockQuantity = { gt: 0 };
        if (filters.rating)
            where.avgRating = { gte: filters.rating };
        if (filters.sizes?.length) {
            where.variants = { some: { size: { in: filters.sizes }, isActive: true } };
        }
        if (filters.colors?.length) {
            where.variants = { some: { color: { in: filters.colors }, isActive: true } };
        }
        const orderBy = {};
        switch (filters.sortBy) {
            case 'price_asc':
                orderBy.basePrice = 'asc';
                break;
            case 'price_desc':
                orderBy.basePrice = 'desc';
                break;
            case 'newest':
                orderBy.createdAt = 'desc';
                break;
            case 'popular':
                orderBy.totalSold = 'desc';
                break;
            case 'rating':
                orderBy.avgRating = 'desc';
                break;
            case 'name':
                orderBy.name = 'asc';
                break;
            default: orderBy.createdAt = 'desc';
        }
        const [total, products] = await Promise.all([
            prisma_1.prisma.product.count({ where }),
            prisma_1.prisma.product.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: {
                    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                    category: { select: { id: true, name: true, slug: true } },
                    variants: { where: { isActive: true }, select: { size: true, color: true, colorHex: true, stockQuantity: true } },
                    badges: true,
                },
            }),
        ]);
        return { products, total, page, limit };
    }
    async getProductBySlug(slug) {
        const product = await prisma_1.prisma.product.findFirst({
            where: { slug, isActive: true, deletedAt: null },
            include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: { select: { id: true, name: true, slug: true } },
                variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
                tags: true,
                badges: true,
                faqs: { orderBy: { sortOrder: 'asc' } },
                collections: { include: { collection: { select: { id: true, name: true, slug: true } } } },
                reviews: {
                    where: { isApproved: true },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
                },
                relatedProducts: {
                    include: {
                        relatedProduct: {
                            include: { images: { where: { isPrimary: true }, take: 1 } },
                        },
                    },
                    take: 8,
                },
            },
        });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        await prisma_1.prisma.product.update({
            where: { id: product.id },
            data: { viewCount: { increment: 1 } },
        });
        return product;
    }
    async createProduct(data) {
        const { images, variantsData, tags, collectionIds, ...productData } = data;
        if (!productData.slug) {
            productData.slug = (0, slugify_1.createSlug)(productData.name);
        }
        const existing = await prisma_1.prisma.product.findUnique({ where: { slug: productData.slug } });
        if (existing)
            productData.slug = `${productData.slug}-${Date.now()}`;
        const product = await prisma_1.prisma.product.create({
            data: {
                ...productData,
                images: images?.length ? { create: images } : undefined,
                variants: variantsData?.length ? { create: variantsData } : undefined,
                tags: tags?.length ? { create: tags.map((tag) => ({ tag })) } : undefined,
                collections: collectionIds?.length ? {
                    create: collectionIds.map((collectionId) => ({ collectionId })),
                } : undefined,
            },
            include: { images: true, variants: true, tags: true },
        });
        return product;
    }
    async getProductById(id) {
        const product = await prisma_1.prisma.product.findFirst({
            where: { id, deletedAt: null },
            include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: { select: { id: true, name: true, slug: true } },
                variants: { orderBy: [{ color: 'asc' }, { sortOrder: 'asc' }] },
                tags: true,
                badges: true,
                faqs: { orderBy: { sortOrder: 'asc' } },
                collections: { include: { collection: { select: { id: true, name: true, slug: true } } } },
            },
        });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        return product;
    }
    async getVariants(productId) {
        const product = await prisma_1.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        return prisma_1.prisma.productVariant.findMany({
            where: { productId },
            orderBy: [{ color: 'asc' }, { sortOrder: 'asc' }],
        });
    }
    async createVariant(productId, data) {
        const product = await prisma_1.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        return prisma_1.prisma.productVariant.create({
            data: {
                productId,
                color: data.color || '',
                colorHex: data.colorHex || '#000000',
                size: data.size || '',
                sku: data.sku || null,
                price: data.price !== undefined && data.price !== '' ? Number(data.price) : null,
                salePrice: data.salePrice !== undefined && data.salePrice !== '' ? Number(data.salePrice) : null,
                stockQuantity: data.stockQuantity !== undefined ? Number(data.stockQuantity) : 0,
                isActive: data.isActive === true || data.isActive === 'true',
                sortOrder: data.sortOrder ? Number(data.sortOrder) : 0,
            },
        });
    }
    async updateVariant(productId, variantId, data) {
        const variant = await prisma_1.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
        if (!variant)
            throw new error_middleware_1.AppError('Variant not found', 404);
        const updates = {};
        if (data.color !== undefined)
            updates.color = data.color;
        if (data.colorHex !== undefined)
            updates.colorHex = data.colorHex;
        if (data.size !== undefined)
            updates.size = data.size;
        if (data.sku !== undefined)
            updates.sku = data.sku;
        if (data.price !== undefined)
            updates.price = data.price !== '' ? Number(data.price) : null;
        if (data.salePrice !== undefined)
            updates.salePrice = data.salePrice !== '' ? Number(data.salePrice) : null;
        if (data.stockQuantity !== undefined)
            updates.stockQuantity = Number(data.stockQuantity);
        if (data.isActive !== undefined)
            updates.isActive = data.isActive === true || data.isActive === 'true';
        if (data.sortOrder !== undefined)
            updates.sortOrder = Number(data.sortOrder);
        return prisma_1.prisma.productVariant.update({ where: { id: variantId }, data: updates });
    }
    async deleteVariant(productId, variantId) {
        const variant = await prisma_1.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
        if (!variant)
            throw new error_middleware_1.AppError('Variant not found', 404);
        await prisma_1.prisma.productVariant.delete({ where: { id: variantId } });
    }
    async updateProduct(id, data) {
        const product = await prisma_1.prisma.product.findFirst({ where: { id, deletedAt: null } });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        const { newImages, tags, collectionIds, removeImageIds, ...productData } = data;
        // Coerce booleans that come as strings from FormData
        const boolFields = ['isActive', 'isFeatured', 'isTrending', 'isNewArrival', 'isBestSeller', 'trackInventory'];
        for (const f of boolFields) {
            if (productData[f] !== undefined) {
                productData[f] = productData[f] === 'true' || productData[f] === true;
            }
        }
        // Coerce numbers
        const numFields = ['basePrice', 'salePrice', 'stockQuantity', 'sortOrder', 'taxPercent'];
        for (const f of numFields) {
            if (productData[f] !== undefined && productData[f] !== '') {
                productData[f] = Number(productData[f]);
            }
            if (productData[f] === '')
                delete productData[f];
        }
        if (productData.name && !productData.slug) {
            const newSlug = (0, slugify_1.createSlug)(productData.name);
            if (newSlug !== product.slug)
                productData.slug = newSlug;
        }
        // Remove images by IDs if requested
        if (removeImageIds?.length) {
            await prisma_1.prisma.productImage.deleteMany({ where: { id: { in: removeImageIds }, productId: id } });
        }
        // Replace tags if provided
        const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : null;
        const updated = await prisma_1.prisma.product.update({
            where: { id },
            data: {
                ...productData,
                ...(parsedTags !== null && {
                    tags: {
                        deleteMany: {},
                        create: parsedTags.map((tag) => ({ tag })),
                    },
                }),
                ...(newImages?.length && {
                    images: {
                        create: newImages.map((img) => img),
                    },
                }),
            },
            include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, tags: true, badges: true },
        });
        // Ensure exactly one primary image:
        // If multiple are marked primary (e.g. old + new upload both have isPrimary:true), keep only the first by sortOrder
        const allPrimaries = await prisma_1.prisma.productImage.findMany({ where: { productId: id, isPrimary: true }, orderBy: { sortOrder: 'asc' } });
        if (allPrimaries.length > 1) {
            await prisma_1.prisma.productImage.updateMany({ where: { productId: id, isPrimary: true, id: { not: allPrimaries[0].id } }, data: { isPrimary: false } });
        }
        else if (allPrimaries.length === 0) {
            const first = await prisma_1.prisma.productImage.findFirst({ where: { productId: id }, orderBy: { sortOrder: 'asc' } });
            if (first)
                await prisma_1.prisma.productImage.update({ where: { id: first.id }, data: { isPrimary: true } });
        }
        return updated;
    }
    async deleteProduct(id) {
        const product = await prisma_1.prisma.product.findFirst({ where: { id, deletedAt: null } });
        if (!product)
            throw new error_middleware_1.AppError('Product not found', 404);
        await prisma_1.prisma.product.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
        });
    }
    async getFeaturedProducts(limit = 8) {
        return prisma_1.prisma.product.findMany({
            where: { isActive: true, isFeatured: true, deletedAt: null },
            take: limit,
            orderBy: { sortOrder: 'asc' },
            include: {
                images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                variants: { where: { isActive: true }, select: { size: true, color: true, colorHex: true } },
                badges: true,
            },
        });
    }
    async getTrendingProducts(limit = 8) {
        return prisma_1.prisma.product.findMany({
            where: { isActive: true, isTrending: true, deletedAt: null },
            take: limit,
            orderBy: [{ totalSold: 'desc' }, { sortOrder: 'asc' }],
            include: {
                images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                variants: { where: { isActive: true }, select: { size: true, color: true, colorHex: true } },
                badges: true,
            },
        });
    }
    async getNewArrivals(limit = 8) {
        return prisma_1.prisma.product.findMany({
            where: { isActive: true, isNewArrival: true, deletedAt: null },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                variants: { where: { isActive: true }, select: { size: true, color: true, colorHex: true } },
                badges: true,
            },
        });
    }
    async getBestSellers(limit = 8) {
        return prisma_1.prisma.product.findMany({
            where: { isActive: true, isBestSeller: true, deletedAt: null },
            take: limit,
            orderBy: { totalSold: 'desc' },
            include: {
                images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
                variants: { where: { isActive: true }, select: { size: true, color: true, colorHex: true } },
                badges: true,
            },
        });
    }
    async searchProducts(query, limit = 10) {
        return prisma_1.prisma.product.findMany({
            where: {
                isActive: true,
                deletedAt: null,
                OR: [
                    { name: { contains: query } },
                    { brand: { contains: query } },
                    { tags: { some: { tag: { contains: query } } } },
                ],
            },
            take: limit,
            select: {
                id: true, name: true, slug: true, basePrice: true, salePrice: true,
                images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { url: true } },
                category: { select: { name: true, slug: true } },
            },
        });
    }
}
exports.ProductService = ProductService;
exports.productService = new ProductService();

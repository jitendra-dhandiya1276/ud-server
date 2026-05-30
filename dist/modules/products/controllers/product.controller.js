"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productController = exports.ProductController = void 0;
const product_service_1 = require("../services/product.service");
const response_1 = require("../../../utils/response");
const upload_1 = require("../../../utils/upload");
class ProductController {
    async getProducts(req, res) {
        const { page, limit, search, categoryId, categorySlug, collectionSlug, minPrice, maxPrice, sizes, colors, brands, isFeatured, isTrending, isNewArrival, isBestSeller, inStock, rating, sortBy, } = req.query;
        const parseBool = (v) => v === 'true' ? true : v === 'false' ? false : undefined;
        const result = await product_service_1.productService.getProducts({
            page: Number(page), limit: Number(limit), search, categoryId, categorySlug, collectionSlug,
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
            sizes: sizes?.split(','),
            colors: colors?.split(','),
            brands: brands?.split(','),
            isFeatured: parseBool(isFeatured),
            isTrending: parseBool(isTrending),
            isNewArrival: parseBool(isNewArrival),
            isBestSeller: parseBool(isBestSeller),
            inStock: inStock === 'true' ? true : undefined,
            rating: rating ? Number(rating) : undefined,
            sortBy: sortBy,
        });
        return (0, response_1.sendPaginated)(res, result.products, result.total, result.page, result.limit);
    }
    async getProductBySlug(req, res) {
        const { slug } = req.params;
        const product = await product_service_1.productService.getProductBySlug(slug);
        return (0, response_1.sendSuccess)(res, product, 'Product fetched');
    }
    async createProduct(req, res) {
        const files = req.files;
        const images = files?.map((file, index) => ({
            url: (0, upload_1.getImageUrl)(file.path),
            altText: req.body.name,
            isPrimary: index === 0,
            sortOrder: index,
        }));
        const product = await product_service_1.productService.createProduct({ ...req.body, images });
        return (0, response_1.sendSuccess)(res, product, 'Product created', 201);
    }
    async getProductById(req, res) {
        const { id } = req.params;
        const product = await product_service_1.productService.getProductById(id);
        return (0, response_1.sendSuccess)(res, product, 'Product fetched');
    }
    async updateProduct(req, res) {
        const { id } = req.params;
        const files = req.files;
        const newImages = files?.map((file, index) => ({
            url: (0, upload_1.getImageUrl)(file.path),
            altText: req.body.name || '',
            isPrimary: index === 0, // first upload is tentatively primary; service auto-demotes if one already exists
            sortOrder: index,
        }));
        const removeImageIds = req.body.removeImageIds
            ? (typeof req.body.removeImageIds === 'string' ? JSON.parse(req.body.removeImageIds) : req.body.removeImageIds)
            : [];
        const product = await product_service_1.productService.updateProduct(id, { ...req.body, newImages, removeImageIds });
        return (0, response_1.sendSuccess)(res, product, 'Product updated');
    }
    async deleteProduct(req, res) {
        const { id } = req.params;
        await product_service_1.productService.deleteProduct(id);
        return (0, response_1.sendSuccess)(res, null, 'Product deleted');
    }
    async getFeaturedProducts(req, res) {
        const products = await product_service_1.productService.getFeaturedProducts(Number(req.query.limit) || 8);
        return (0, response_1.sendSuccess)(res, products, 'Featured products');
    }
    async getTrendingProducts(req, res) {
        const products = await product_service_1.productService.getTrendingProducts(Number(req.query.limit) || 8);
        return (0, response_1.sendSuccess)(res, products, 'Trending products');
    }
    async getNewArrivals(req, res) {
        const products = await product_service_1.productService.getNewArrivals(Number(req.query.limit) || 8);
        return (0, response_1.sendSuccess)(res, products, 'New arrivals');
    }
    async getBestSellers(req, res) {
        const products = await product_service_1.productService.getBestSellers(Number(req.query.limit) || 8);
        return (0, response_1.sendSuccess)(res, products, 'Best sellers');
    }
    async search(req, res) {
        const { q, limit } = req.query;
        if (!q)
            return (0, response_1.sendError)(res, 'Search query required', 400);
        const products = await product_service_1.productService.searchProducts(q, Number(limit) || 10);
        return (0, response_1.sendSuccess)(res, products, 'Search results');
    }
    // ── Variant CRUD ──────────────────────────────────────────────
    async getVariants(req, res) {
        const { id } = req.params;
        const variants = await product_service_1.productService.getVariants(id);
        return (0, response_1.sendSuccess)(res, variants, 'Variants fetched');
    }
    async createVariant(req, res) {
        const { id } = req.params;
        const variant = await product_service_1.productService.createVariant(id, req.body);
        return (0, response_1.sendSuccess)(res, variant, 'Variant created', 201);
    }
    async updateVariant(req, res) {
        const { id, vid } = req.params;
        const variant = await product_service_1.productService.updateVariant(id, vid, req.body);
        return (0, response_1.sendSuccess)(res, variant, 'Variant updated');
    }
    async deleteVariant(req, res) {
        const { id, vid } = req.params;
        await product_service_1.productService.deleteVariant(id, vid);
        return (0, response_1.sendSuccess)(res, null, 'Variant deleted');
    }
}
exports.ProductController = ProductController;
exports.productController = new ProductController();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productController = exports.ProductController = void 0;
const product_service_1 = require("../services/product.service");
const response_1 = require("../../../utils/response");
const upload_1 = require("../../../utils/upload");
const colorName_1 = require("../../../utils/colorName");
const parseArray = (val) => {
    if (!val)
        return undefined;
    if (Array.isArray(val))
        return val;
    try {
        const p = JSON.parse(val);
        return Array.isArray(p) ? p : undefined;
    }
    catch { }
    if (typeof val === 'string')
        return val.split(',').map(s => s.trim()).filter(Boolean);
    return undefined;
};
const parseBool = (val) => {
    if (val === undefined || val === null || val === '')
        return undefined;
    if (typeof val === 'boolean')
        return val;
    return val === 'true' || val === '1';
};
const parseNum = (val) => {
    if (val === undefined || val === null || val === '')
        return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
};
const sanitizeProductBody = (body) => {
    const b = { ...body };
    // Booleans
    for (const k of ['isFeatured', 'isTrending', 'isNewArrival', 'isBestSeller', 'isActive', 'trackInventory']) {
        if (k in b)
            b[k] = parseBool(b[k]);
    }
    // Numbers
    for (const k of ['basePrice', 'salePrice', 'stockQuantity', 'sortOrder', 'taxPercent', 'costPrice', 'weight', 'lowStockAlert', 'standardShippingCharge', 'codShippingCharge', 'expressShippingCharge']) {
        if (k in b)
            b[k] = parseNum(b[k]);
    }
    // Arrays
    b.tags = parseArray(b.tags);
    b.collectionIds = parseArray(b.collectionIds);
    // Field name mapping: frontend → Prisma schema
    if (b.material !== undefined) {
        b.fabric = b.fabric || b.material;
        delete b.material;
    }
    if (b.metaDescription !== undefined) {
        b.metaDesc = b.metaDesc || b.metaDescription;
        delete b.metaDescription;
    }
    // Remove fields not in Prisma schema
    delete b.fit;
    delete b.style;
    // Normalize gender value
    if (b.gender)
        b.gender = String(b.gender).toUpperCase();
    // Parse variants JSON string → flat variantsData array
    if (b.variants && !b.variantsData) {
        try {
            const parsed = typeof b.variants === 'string' ? JSON.parse(b.variants) : b.variants;
            if (Array.isArray(parsed)) {
                b.variantsData = parsed.flatMap((v) => (v.sizes || []).map((s) => ({
                    color: v.color || undefined,
                    // Admins type a colour name; derive the swatch here so the bulk
                    // create path matches the single-variant path.
                    colorHex: v.colorHex || (0, colorName_1.colorNameToHex)(v.color) || undefined,
                    size: s.size || undefined,
                    stockQuantity: s.stock ? Number(s.stock) : 0,
                    price: s.price ? Number(s.price) : undefined,
                })));
            }
        }
        catch { }
        delete b.variants;
    }
    return b;
};
/**
 * Guarantee a sensible product-level stock figure on create.
 *
 * Order validation checks `Product.stockQuantity` — NOT the sum of variant
 * stock (see OrderService.createOrder). A create request that omits the field
 * therefore lands on the Prisma default of 0 and the product is unbuyable
 * ("Insufficient stock") no matter how much variant stock was entered
 * alongside it. That is exactly what happened to every product added through
 * the admin form, which had no stock input at all.
 *
 * When the caller does not state a figure, fall back to the total across the
 * variants it did supply. An explicit 0 is still honoured — that is a
 * deliberate "out of stock".
 */
const withDerivedStock = (b) => {
    const provided = b.stockQuantity;
    const isMissing = provided === undefined || provided === null || provided === '' || Number.isNaN(provided);
    if (!isMissing)
        return b;
    const total = Array.isArray(b.variantsData)
        ? b.variantsData.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0)
        : 0;
    return { ...b, stockQuantity: total };
};
class ProductController {
    /**
     * Admin catalogue listing — includes drafts, which the public listing hides.
     */
    async getAdminProducts(req, res) {
        const { page, limit, search, categoryId, gender, sortBy, status } = req.query;
        const result = await product_service_1.productService.getAdminProducts({
            page: Number(page) || 1,
            limit: Number(limit) || 20,
            search,
            categoryId,
            gender,
            sortBy: sortBy,
            status: status === 'active' || status === 'draft' ? status : undefined,
        });
        return (0, response_1.sendPaginated)(res, result.products, result.total, result.page, result.limit);
    }
    async getProducts(req, res) {
        const { page, limit, search, categoryId, categorySlug, collectionSlug, minPrice, maxPrice, sizes, colors, brands, isFeatured, isTrending, isNewArrival, isBestSeller, inStock, rating, sortBy, gender, } = req.query;
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
            gender: gender || undefined,
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
        const body = withDerivedStock(sanitizeProductBody({ ...req.body, images }));
        const product = await product_service_1.productService.createProduct(body);
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
        // Position and cover are assigned by the service from imageOrder, so the
        // upload itself no longer guesses at either.
        const newImages = files?.map((file) => ({
            url: (0, upload_1.getImageUrl)(file.path),
            altText: req.body.name || '',
        }));
        const removeImageIds = req.body.removeImageIds
            ? (typeof req.body.removeImageIds === 'string' ? JSON.parse(req.body.removeImageIds) : req.body.removeImageIds)
            : [];
        // Ordered token list from the admin drag UI: existing image ids, plus
        // `new:<n>` for the nth file in this same upload.
        const imageOrder = parseArray(req.body.imageOrder);
        const body = sanitizeProductBody({ ...req.body, newImages, removeImageIds, imageOrder });
        const product = await product_service_1.productService.updateProduct(id, body);
        return (0, response_1.sendSuccess)(res, product, 'Product updated');
    }
    async deleteProduct(req, res) {
        const { id } = req.params;
        await product_service_1.productService.deleteProduct(id);
        return (0, response_1.sendSuccess)(res, null, 'Product deleted');
    }
    async getFeaturedProducts(req, res) {
        const { gender } = req.query;
        const products = await product_service_1.productService.getFeaturedProducts(Number(req.query.limit) || 8, gender);
        return (0, response_1.sendSuccess)(res, products, 'Featured products');
    }
    async getTrendingProducts(req, res) {
        const { gender } = req.query;
        const products = await product_service_1.productService.getTrendingProducts(Number(req.query.limit) || 8, gender);
        return (0, response_1.sendSuccess)(res, products, 'Trending products');
    }
    async getNewArrivals(req, res) {
        const { gender } = req.query;
        const products = await product_service_1.productService.getNewArrivals(Number(req.query.limit) || 8, gender);
        return (0, response_1.sendSuccess)(res, products, 'New arrivals');
    }
    async getBestSellers(req, res) {
        const { gender } = req.query;
        const products = await product_service_1.productService.getBestSellers(Number(req.query.limit) || 8, gender);
        return (0, response_1.sendSuccess)(res, products, 'Best sellers');
    }
    async search(req, res) {
        const { q, limit } = req.query;
        if (!q)
            return (0, response_1.sendError)(res, 'Search query required', 400);
        const products = await product_service_1.productService.searchProducts(q, Number(limit) || 10);
        return (0, response_1.sendSuccess)(res, products, 'Search results');
    }
    /**
     * PATCH /products/positions — bulk display-priority update.
     * Body: { items: [{ id, sortOrder }] }. Higher sortOrder shows first.
     */
    async updatePositions(req, res) {
        const { items } = req.body;
        if (!Array.isArray(items))
            return (0, response_1.sendError)(res, 'items array required', 400);
        const updated = await product_service_1.productService.updatePositions(items);
        return (0, response_1.sendSuccess)(res, { updated }, 'Positions updated');
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

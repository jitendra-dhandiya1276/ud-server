"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("express-async-errors");
const express_1 = __importDefault(require("express"));
// Prisma $queryRaw returns BigInt for COUNT/SUM — make JSON.stringify handle it
BigInt.prototype.toJSON = function () { return Number(this); };
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const xss_clean_1 = __importDefault(require("xss-clean"));
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const error_middleware_1 = require("./middlewares/error.middleware");
// Route imports
const auth_routes_1 = __importDefault(require("./modules/auth/routes/auth.routes"));
const product_routes_1 = __importDefault(require("./modules/products/routes/product.routes"));
const category_routes_1 = __importDefault(require("./modules/categories/routes/category.routes"));
const cart_routes_1 = __importDefault(require("./modules/cart/routes/cart.routes"));
const order_routes_1 = __importDefault(require("./modules/orders/routes/order.routes"));
const payment_routes_1 = __importDefault(require("./modules/payments/routes/payment.routes"));
const wishlist_routes_1 = __importDefault(require("./modules/wishlist/routes/wishlist.routes"));
const user_routes_1 = __importDefault(require("./modules/users/routes/user.routes"));
const review_routes_1 = __importDefault(require("./modules/reviews/routes/review.routes"));
const banner_routes_1 = __importDefault(require("./modules/banners/routes/banner.routes"));
const coupon_routes_1 = __importDefault(require("./modules/coupons/routes/coupon.routes"));
const collection_routes_1 = __importDefault(require("./modules/collections/routes/collection.routes"));
const homepage_routes_1 = __importDefault(require("./modules/homepage/routes/homepage.routes"));
const blog_routes_1 = __importDefault(require("./modules/blogs/routes/blog.routes"));
const analytics_routes_1 = __importDefault(require("./modules/admin/routes/analytics.routes"));
const settings_routes_1 = __importDefault(require("./modules/settings/routes/settings.routes"));
const seo_routes_1 = __importDefault(require("./modules/seo/routes/seo.routes"));
const media_routes_1 = __importDefault(require("./modules/media/routes/media.routes"));
const app = (0, express_1.default)();
// Trust proxy (for deployment behind Nginx)
app.set('trust proxy', 1);
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// CORS
app.use((0, cors_1.default)({
    origin: [env_1.config.frontendUrl, env_1.config.adminUrl],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
}));
// Rate limiting — disabled in development to avoid 429s during active work
if (env_1.config.isProd) {
    const limiter = (0, express_rate_limit_1.default)({
        windowMs: env_1.config.rateLimit.windowMs,
        max: env_1.config.rateLimit.max,
        message: { success: false, message: 'Too many requests, please try again later.' },
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api', limiter);
    const authLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: { success: false, message: 'Too many auth attempts, please try again.' },
    });
    app.use('/api/v1/auth/login', authLimiter);
    app.use('/api/v1/auth/register', authLimiter);
}
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// XSS protection
app.use((0, xss_clean_1.default)());
// Compression
app.use((0, compression_1.default)());
// Logging
if (env_1.config.isDev) {
    app.use((0, morgan_1.default)('dev', {
        stream: { write: (msg) => logger_1.logger.http(msg.trim()) },
    }));
}
// Static file serving for uploads
app.use('/uploads', express_1.default.static(path_1.default.resolve(env_1.config.upload.path), {
    maxAge: '1d',
    etag: true,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    },
}));
// Health check
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
// API Routes
const v1 = '/api/v1';
app.use(`${v1}/auth`, auth_routes_1.default);
app.use(`${v1}/products`, product_routes_1.default);
app.use(`${v1}/categories`, category_routes_1.default);
app.use(`${v1}/cart`, cart_routes_1.default);
app.use(`${v1}/orders`, order_routes_1.default);
app.use(`${v1}/payments`, payment_routes_1.default);
app.use(`${v1}/wishlist`, wishlist_routes_1.default);
app.use(`${v1}/users`, user_routes_1.default);
app.use(`${v1}/reviews`, review_routes_1.default);
app.use(`${v1}/banners`, banner_routes_1.default);
app.use(`${v1}/coupons`, coupon_routes_1.default);
app.use(`${v1}/collections`, collection_routes_1.default);
app.use(`${v1}/homepage`, homepage_routes_1.default);
app.use(`${v1}/blogs`, blog_routes_1.default);
app.use(`${v1}/analytics`, analytics_routes_1.default);
app.use(`${v1}/settings`, settings_routes_1.default);
app.use(`${v1}/seo`, seo_routes_1.default);
app.use(`${v1}/media`, media_routes_1.default);
// 404 & error handler
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
exports.default = app;

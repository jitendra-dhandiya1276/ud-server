import 'express-async-errors';
import express from 'express';

// Prisma $queryRaw returns BigInt for COUNT/SUM — make JSON.stringify handle it
(BigInt.prototype as any).toJSON = function () { return Number(this); };
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import xss from 'xss-clean';

import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middlewares/error.middleware';

// Route imports
import authRoutes from './modules/auth/routes/auth.routes';
import productRoutes from './modules/products/routes/product.routes';
import categoryRoutes from './modules/categories/routes/category.routes';
import cartRoutes from './modules/cart/routes/cart.routes';
import orderRoutes from './modules/orders/routes/order.routes';
import paymentRoutes from './modules/payments/routes/payment.routes';
import wishlistRoutes from './modules/wishlist/routes/wishlist.routes';
import userRoutes from './modules/users/routes/user.routes';
import reviewRoutes from './modules/reviews/routes/review.routes';
import bannerRoutes from './modules/banners/routes/banner.routes';
import couponRoutes from './modules/coupons/routes/coupon.routes';
import collectionRoutes from './modules/collections/routes/collection.routes';
import homepageRoutes from './modules/homepage/routes/homepage.routes';
import blogRoutes from './modules/blogs/routes/blog.routes';
import analyticsRoutes from './modules/admin/routes/analytics.routes';
import settingsRoutes from './modules/settings/routes/settings.routes';
import seoRoutes from './modules/seo/routes/seo.routes';
import mediaRoutes from './modules/media/routes/media.routes';
import storeRoutes from './modules/stores/routes/store.routes';

const app = express();

// Trust proxy (for deployment behind Nginx)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — always include local dev origins alongside configured production URLs
const ALLOWED_ORIGINS = [
  config.frontendUrl,
  config.adminUrl,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server / curl / Postman (no Origin header)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
}));

// Rate limiting — disabled in development to avoid 429s during active work
if (config.isProd) {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts, please try again.' },
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// XSS protection
app.use(xss());

// Compression
app.use(compression());

// Logging
if (config.isDev) {
  app.use(morgan('dev', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// Static file serving for uploads
app.use('/uploads', express.static(path.resolve(config.upload.path), {
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
app.use(`${v1}/auth`, authRoutes);
app.use(`${v1}/products`, productRoutes);
app.use(`${v1}/categories`, categoryRoutes);
app.use(`${v1}/cart`, cartRoutes);
app.use(`${v1}/orders`, orderRoutes);
app.use(`${v1}/payments`, paymentRoutes);
app.use(`${v1}/wishlist`, wishlistRoutes);
app.use(`${v1}/users`, userRoutes);
app.use(`${v1}/reviews`, reviewRoutes);
app.use(`${v1}/banners`, bannerRoutes);
app.use(`${v1}/coupons`, couponRoutes);
app.use(`${v1}/collections`, collectionRoutes);
app.use(`${v1}/homepage`, homepageRoutes);
app.use(`${v1}/blogs`, blogRoutes);
app.use(`${v1}/analytics`, analyticsRoutes);
app.use(`${v1}/settings`, settingsRoutes);
app.use(`${v1}/seo`, seoRoutes);
app.use(`${v1}/media`, mediaRoutes);
app.use(`${v1}/stores`, storeRoutes);

// 404 & error handler
app.use(notFound);
app.use(errorHandler);

export default app;

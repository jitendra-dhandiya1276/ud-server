"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const REQUIRED_IN_PROD = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
if (process.env.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PROD.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.error(`FATAL: missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}
exports.config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:5000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    adminUrl: process.env.ADMIN_URL || 'http://localhost:3000/admin',
    db: {
        url: process.env.DATABASE_URL || '',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
        expire: process.env.JWT_EXPIRE || '1d',
        refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
    },
    upload: {
        path: process.env.UPLOAD_PATH || './uploads',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
        allowedTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/jpg,image/png,image/webp').split(','),
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    },
    cashfree: {
        appId: process.env.CASHFREE_APP_ID || '',
        secretKey: process.env.CASHFREE_SECRET_KEY || '',
        env: (process.env.CASHFREE_ENV || 'sandbox'),
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        fromEmail: process.env.FROM_EMAIL || 'noreply@fashionstore.com',
        fromName: process.env.FROM_NAME || 'Fashion Store',
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '500', 10),
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    isDev: process.env.NODE_ENV === 'development',
    isProd: process.env.NODE_ENV === 'production',
};

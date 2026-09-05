"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = exports.AppError = void 0;
const logger_1 = require("../utils/logger");
const env_1 = require("../config/env");
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const notFound = (_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
};
exports.notFound = notFound;
/**
 * Fields that must never reach the log file.
 *
 * The handler logs the request body to make failures diagnosable, which meant
 * every failed login wrote the submitted password into logs/error.log in clear
 * text — and log files get copied around, shipped to support, and kept far
 * longer than anyone intends. Failed sign-ins are now the most common error
 * this handler sees, so the body is redacted before it is written.
 */
const SENSITIVE_FIELDS = [
    'password', 'newPassword', 'currentPassword', 'confirmPassword',
    'token', 'refreshToken', 'accessToken', 'otp', 'apiKey', 'secret',
];
const redact = (body) => {
    if (!body || typeof body !== 'object')
        return body;
    const clone = { ...body };
    for (const key of Object.keys(clone)) {
        if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
            clone[key] = '[redacted]';
        }
    }
    return clone;
};
const errorHandler = (err, req, res, _next) => {
    const statusCode = 'statusCode' in err ? err.statusCode : 500;
    const message = err.message || 'Internal Server Error';
    logger_1.logger.error(`${req.method} ${req.path} - ${statusCode} - ${message}`, {
        stack: err.stack,
        body: redact(req.body),
        params: req.params,
    });
    // Some failures carry a machine-readable reason the client must act on —
    // an unverified sign-in has to send the customer to the code screen rather
    // than just showing them the message.
    const code = err.code;
    const email = err.email;
    res.status(statusCode).json({
        success: false,
        message,
        ...(typeof code === 'string' && { code }),
        ...(typeof email === 'string' && { email }),
        ...(env_1.config.isDev && { stack: err.stack }),
    });
};
exports.errorHandler = errorHandler;

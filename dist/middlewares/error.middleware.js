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
const errorHandler = (err, req, res, _next) => {
    const statusCode = 'statusCode' in err ? err.statusCode : 500;
    const message = err.message || 'Internal Server Error';
    logger_1.logger.error(`${req.method} ${req.path} - ${statusCode} - ${message}`, {
        stack: err.stack,
        body: req.body,
        params: req.params,
    });
    res.status(statusCode).json({
        success: false,
        message,
        ...(env_1.config.isDev && { stack: err.stack }),
    });
};
exports.errorHandler = errorHandler;

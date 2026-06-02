"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPaginated = exports.sendError = exports.sendSuccess = void 0;
const sendSuccess = (res, data, message = 'Success', statusCode = 200, meta) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        ...(meta && { meta }),
    });
};
exports.sendSuccess = sendSuccess;
const sendError = (res, message = 'Internal Server Error', statusCode = 500, errors) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors !== undefined ? { errors } : {}),
    });
};
exports.sendError = sendError;
const sendPaginated = (res, data, total, page, limit, message = 'Success') => {
    return res.status(200).json({
        success: true,
        message,
        data,
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    });
};
exports.sendPaginated = sendPaginated;

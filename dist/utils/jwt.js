"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.signRefreshToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const signAccessToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, env_1.config.jwt.secret, {
        expiresIn: env_1.config.jwt.expire,
    });
};
exports.signAccessToken = signAccessToken;
const signRefreshToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, env_1.config.jwt.refreshSecret, {
        expiresIn: env_1.config.jwt.refreshExpire,
    });
};
exports.signRefreshToken = signRefreshToken;
const verifyAccessToken = (token) => {
    return jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
};
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => {
    return jsonwebtoken_1.default.verify(token, env_1.config.jwt.refreshSecret);
};
exports.verifyRefreshToken = verifyRefreshToken;

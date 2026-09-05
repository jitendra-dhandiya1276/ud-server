"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpMatches = exports.hashOtp = exports.generateOtp = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
/**
 * One-time codes, shared by every feature that needs one.
 *
 * The rules are the same wherever a code is used, so they live in one place:
 * generate from a real CSPRNG, store only a keyed hash, and compare in
 * constant time. Two copies of this would eventually disagree, and the copy
 * that drifted would be the one nobody noticed.
 */
/** A numeric code of `length` digits, leading zeros preserved. */
const generateOtp = (length = 6) => {
    const max = 10 ** length;
    return String(crypto_1.default.randomInt(0, max)).padStart(length, '0');
};
exports.generateOtp = generateOtp;
/**
 * Salted with something identifying (an order id, a user id) so a hash lifted
 * from one row cannot be replayed against another, and keyed with the server
 * secret so a database dump alone cannot be brute-forced offline — a 6-digit
 * space is trivially small without the key.
 */
const hashOtp = (salt, code) => crypto_1.default.createHmac('sha256', env_1.config.jwt.secret).update(`${salt}:${code}`).digest('hex');
exports.hashOtp = hashOtp;
/** Constant-time comparison — a timing side channel would leak the code digit by digit. */
const otpMatches = (salt, code, stored) => {
    const candidate = Buffer.from((0, exports.hashOtp)(salt, code), 'utf8');
    const expected = Buffer.from(stored, 'utf8');
    if (candidate.length !== expected.length)
        return false;
    return crypto_1.default.timingSafeEqual(candidate, expected);
};
exports.otpMatches = otpMatches;

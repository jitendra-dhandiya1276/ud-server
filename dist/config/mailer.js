"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMailConfigured = isMailConfigured;
exports.missingMailConfig = missingMailConfig;
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
/**
 * SMTP is optional: the app runs fine without it until something actually
 * needs to send mail. So the transport is built on first use and the
 * "is it configured?" question is answered separately, letting callers give
 * a useful error instead of a silent failure.
 */
let transporter = null;
function isMailConfigured() {
    return Boolean(env_1.config.smtp.host && env_1.config.smtp.user && env_1.config.smtp.pass);
}
/** The env vars a deployer still has to fill in. Used in error messages. */
function missingMailConfig() {
    const missing = [];
    if (!env_1.config.smtp.host)
        missing.push('SMTP_HOST');
    if (!env_1.config.smtp.user)
        missing.push('SMTP_USER');
    if (!env_1.config.smtp.pass)
        missing.push('SMTP_PASS');
    return missing;
}
function getTransporter() {
    if (!transporter) {
        transporter = nodemailer_1.default.createTransport({
            host: env_1.config.smtp.host,
            port: env_1.config.smtp.port,
            // 465 is implicit TLS; 587 upgrades with STARTTLS.
            secure: env_1.config.smtp.port === 465,
            auth: { user: env_1.config.smtp.user, pass: env_1.config.smtp.pass },
        });
    }
    return transporter;
}
async function sendMail({ to, subject, html, text }) {
    if (!isMailConfigured()) {
        throw new Error(`Email is not configured on this server (missing ${missingMailConfig().join(', ')})`);
    }
    const from = `"${env_1.config.smtp.fromName}" <${env_1.config.smtp.fromEmail}>`;
    await getTransporter().sendMail({ from, to, subject, html, text });
    // The address is logged, never the body: OTP mails pass through here.
    logger_1.logger.info('Email sent', { to, subject });
}

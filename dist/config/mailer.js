"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailProvider = mailProvider;
exports.isMailConfigured = isMailConfigured;
exports.missingMailConfig = missingMailConfig;
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
/**
 * Outbound mail, with two ways out of the building.
 *
 * Brevo's HTTP API is preferred when a key is present: it is a single HTTPS
 * POST, it answers in about a second, and when it refuses it says why
 * ("sender not verified" is the usual one). Their SMTP relay — or any other
 * SMTP server — is the fallback, and needs no code, only credentials.
 *
 * Nothing here is configured by default. Callers ask `isMailConfigured()`
 * first so a missing setup produces a useful message instead of a timeout.
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 15000;
function mailProvider() {
    if (env_1.config.brevo.apiKey)
        return 'BREVO_API';
    if (env_1.config.smtp.host && env_1.config.smtp.user && env_1.config.smtp.pass)
        return 'SMTP';
    return 'NONE';
}
function isMailConfigured() {
    return mailProvider() !== 'NONE';
}
/** The env vars a deployer still has to fill in. Used in error messages. */
function missingMailConfig() {
    if (isMailConfigured())
        return [];
    // Only one route needs completing, so name the easier one rather than
    // listing every variable of both.
    return ['BREVO_API_KEY', 'or SMTP_HOST + SMTP_USER + SMTP_PASS'];
}
// ─── Brevo HTTP API ──────────────────────────────────────────────────────
async function sendViaBrevo({ to, subject, html, text }) {
    let res;
    try {
        res = await fetch(BREVO_ENDPOINT, {
            method: 'POST',
            headers: {
                'api-key': env_1.config.brevo.apiKey,
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify({
                sender: { name: env_1.config.smtp.fromName, email: env_1.config.smtp.fromEmail },
                to: [{ email: to }],
                subject,
                htmlContent: html,
                textContent: text,
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
    }
    catch (err) {
        throw new Error(`Could not reach Brevo: ${err?.message ?? 'network error'}`);
    }
    if (res.ok)
        return;
    // Brevo answers failures with { code, message }. That message is the most
    // useful thing anyone gets when a send is refused, so it is carried through
    // rather than flattened into "email failed".
    const body = await res.text();
    let detail = body.slice(0, 300);
    try {
        const parsed = JSON.parse(body);
        if (parsed?.message)
            detail = parsed.message;
    }
    catch { /* not JSON — the raw body is still better than nothing */ }
    if (res.status === 401) {
        throw new Error(`Brevo rejected the API key (${detail})`);
    }
    if (res.status === 400 && /sender/i.test(detail)) {
        throw new Error(`Brevo will not send from ${env_1.config.smtp.fromEmail}: ${detail}. ` +
            `Add that address as a verified sender in Brevo, or set FROM_EMAIL to one that is.`);
    }
    throw new Error(`Brevo refused the message (${res.status}): ${detail}`);
}
// ─── SMTP (Brevo's relay, or anything else) ──────────────────────────────
let transporter = null;
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
async function sendViaSmtp({ to, subject, html, text }) {
    const from = `"${env_1.config.smtp.fromName}" <${env_1.config.smtp.fromEmail}>`;
    await getTransporter().sendMail({ from, to, subject, html, text });
}
// ─── Entry point ─────────────────────────────────────────────────────────
async function sendMail(input) {
    const provider = mailProvider();
    if (provider === 'NONE') {
        throw new Error(`Email is not configured on this server (set ${missingMailConfig().join(' ')})`);
    }
    if (provider === 'BREVO_API') {
        await sendViaBrevo(input);
    }
    else {
        await sendViaSmtp(input);
    }
    // The address and provider are logged, never the body: OTP mails pass here.
    logger_1.logger.info('Email sent', { to: input.to, subject: input.subject, provider });
}

import nodemailer, { Transporter } from 'nodemailer';
import { config } from './env';
import { logger } from '../utils/logger';

/**
 * SMTP is optional: the app runs fine without it until something actually
 * needs to send mail. So the transport is built on first use and the
 * "is it configured?" question is answered separately, letting callers give
 * a useful error instead of a silent failure.
 */
let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

/** The env vars a deployer still has to fill in. Used in error messages. */
export function missingMailConfig(): string[] {
  const missing: string[] = [];
  if (!config.smtp.host) missing.push('SMTP_HOST');
  if (!config.smtp.user) missing.push('SMTP_USER');
  if (!config.smtp.pass) missing.push('SMTP_PASS');
  return missing;
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail({ to, subject, html, text }: MailInput): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error(`Email is not configured on this server (missing ${missingMailConfig().join(', ')})`);
  }

  const from = `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;
  await getTransporter().sendMail({ from, to, subject, html, text });
  // The address is logged, never the body: OTP mails pass through here.
  logger.info('Email sent', { to, subject });
}

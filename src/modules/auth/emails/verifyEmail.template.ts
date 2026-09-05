interface VerifyEmail {
  customerName: string;
  otp: string;
  minutesValid: number;
  storeName: string;
}

/**
 * The first email a customer ever gets from us, and the one standing between
 * them and a finished sign-up — so the code comes first and the welcome
 * second. Anything that delays finding the six digits costs a registration.
 */
export function verifyEmailTemplate(d: VerifyEmail) {
  const subject = `${d.otp} is your ${d.storeName} verification code`;

  const text = [
    `Hi ${d.customerName},`,
    ``,
    `Welcome to ${d.storeName}.`,
    ``,
    `Your verification code is ${d.otp}.`,
    ``,
    `Enter it on the sign-up page to finish creating your account.`,
    `The code is valid for ${d.minutesValid} minutes.`,
    ``,
    `If you did not sign up, you can ignore this email — no account will be`,
    `activated without this code.`,
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f6f6;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px">
    <p style="margin:0 0 4px;font-size:15px;color:#111">Hi ${escapeHtml(d.customerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444">
      Welcome to <strong style="color:#111">${escapeHtml(d.storeName)}</strong>.
      Here is your verification code:
    </p>

    <div style="background:#111;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
      <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#fff;font-family:monospace">
        ${escapeHtml(d.otp)}
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:#444">
      Enter it on the sign-up page to finish creating your account.
      It is valid for ${d.minutesValid} minutes.
    </p>

    <div style="background:#f4f4f4;padding:12px 14px;border-radius:6px">
      <p style="margin:0;font-size:13px;color:#555;line-height:1.5">
        Didn't sign up? You can ignore this email — no account is activated
        without this code.
      </p>
    </div>
  </div>
</div>`.trim();

  return { subject, text, html };
}

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryOtpEmail = deliveryOtpEmail;
/**
 * Deliberately plain. This mail is read on a phone, at a door, in a hurry —
 * the code has to be the first thing the eye lands on, and the warning has to
 * be impossible to miss.
 */
function deliveryOtpEmail(d) {
    const subject = `${d.otp} is your delivery code for order ${d.orderNumber}`;
    const text = [
        `Hi ${d.customerName},`,
        ``,
        `Your delivery confirmation code is ${d.otp}.`,
        ``,
        `Share this code with the delivery person for order ${d.orderNumber} only`,
        `AFTER you have the parcel in your hands.`,
        ``,
        `The code is valid for ${d.minutesValid} minutes.`,
        ``,
        `${d.storeName} will never ask you for this code over a phone call, and we`,
        `never ask for payment details. If you have not received a parcel, do not`,
        `share this code with anyone.`,
    ].join('\n');
    const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f6f6;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px">
    <p style="margin:0 0 4px;font-size:15px;color:#111">Hi ${escapeHtml(d.customerName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444">
      Your delivery confirmation code for order
      <strong style="color:#111">${escapeHtml(d.orderNumber)}</strong> is:
    </p>

    <div style="background:#111;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px">
      <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#fff;font-family:monospace">
        ${escapeHtml(d.otp)}
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:#444">
      Give this code to the delivery person
      <strong style="color:#111">only after the parcel is in your hands</strong>.
      It is valid for ${d.minutesValid} minutes.
    </p>

    <div style="background:#fff8e1;border-left:3px solid #f0a202;padding:12px 14px;border-radius:6px">
      <p style="margin:0;font-size:13px;color:#5a4300;line-height:1.5">
        ${escapeHtml(d.storeName)} will never ask you for this code on a phone call,
        and will never ask you for card, UPI or bank details. If no parcel has
        reached you, do not share this code with anyone.
      </p>
    </div>
  </div>
</div>`.trim();
    return { subject, text, html };
}
function escapeHtml(v) {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

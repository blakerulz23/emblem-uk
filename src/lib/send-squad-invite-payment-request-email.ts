/**
 * Sends the "pay for your child's Squad Invite card now" email — same
 * Resend integration and never-throws contract as
 * send-squad-invite-notification-email.ts, but a genuinely separate file:
 * that one is organiser-level (tied to squad_invite_notification_outbox,
 * one row per request), this is participation-level, addressed to a
 * parent/guardian, and carries a real payment link and price — a
 * different recipient, a different data shape, and (unlike every
 * organiser email) something that must never be sent while the payment
 * wall (squad_invite_payment_mode_enabled()) is off. That gate lives in
 * the caller (the finalise-pricing route), not here — this function has
 * no way to check it and shouldn't need to.
 */
export async function sendSquadInvitePaymentRequestEmail(params: {
  toEmail: string;
  teamName: string;
  paymentUrl: string;
  unitPricePence: number;
  printQuantity: number;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping Squad Invite payment request email.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const totalPence = params.unitPricePence * params.printQuantity;
  const priceLine = params.printQuantity > 1
    ? `${formatPence(params.unitPricePence)} per card × ${params.printQuantity} = ${formatPence(totalPence)}`
    : formatPence(params.unitPricePence);
  const team = escapeHtml(params.teamName);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: params.toEmail,
        subject: `Complete payment for your Squad Invite card — ${params.teamName}`,
        html: `
          <h2>Your card is ready — payment is now open</h2>
          <p>Squad numbers for <strong>${team}</strong> are finalised, and it's time to complete payment for the card you built.</p>
          <p><strong>${priceLine}</strong></p>
          <p><a href="${params.paymentUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Pay now</a></p>
          <p>This link is valid for 72 hours from when it was issued.</p>
        `,
      }),
    });
    if (!res.ok) {
      console.warn('Resend Squad Invite payment request email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend Squad Invite payment request email threw', err);
    return { ok: false };
  }
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Sends a Squad Invite guardian a reminder to tap/claim their child's
 * card — the gap flagged this session: claim_token exists from card
 * creation and the guardian's email is already on file, but nothing ever
 * told them the card is ready. Staff-triggered only (see
 * send-claim-reminder/route.ts's own comment for why this isn't
 * automatic — there's no reliable "shipped" signal to fire it from yet).
 *
 * Deliberately its own small module rather than an addition to
 * send-squad-invite-notification-email.ts — that file's templates are all
 * built around one publicReference-keyed manage-page URL; this needs
 * buildNfcCardUrl(claimToken) instead, a completely different link shape,
 * and forcing it into the same signature would make both harder to read.
 *
 * Same "never throws, caller decides what a failed send means" contract
 * as the sibling module — a failed email must not stop the caller from
 * still recording the attempt.
 */
export async function sendSquadInviteCardClaimReminderEmail(params: {
  toEmail: string;
  teamName: string;
  claimUrl: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping card claim reminder email; the underlying state is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const team = escapeHtml(params.teamName);
  const subject = `Your Squad Invite card for ${params.teamName} is ready — tap to activate`;
  const html = `<h2>Your card is ready</h2><p>Your child's card for <strong>${team}</strong> is ready. Tap it on your phone, or open the link below on the device you'll use for Player OS, to activate it.</p><p><a href="${params.claimUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Activate the card</a></p><p style="color:#6b7280;font-size:13px">This link works once, for this specific card. If you weren't expecting this email, you can ignore it.</p>`;
  const text = `Your card is ready\n\nYour child's card for ${params.teamName} is ready. Tap it on your phone, or open this link on the device you'll use for Player OS, to activate it.\n\nActivate the card: ${params.claimUrl}\n\nThis link works once, for this specific card. If you weren't expecting this email, you can ignore it.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html, text }),
    });
    if (!res.ok) {
      console.warn('Resend card claim reminder email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend card claim reminder email threw', err);
    return { ok: false };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

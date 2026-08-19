/**
 * Sends a Squad Invite guardian an early look at their child's card once
 * staff approve it for production — triggered from the approve route
 * (src/app/api/orders/[id]/approve/route.ts's approveSquadInviteOrder),
 * not from commit. It originally fired at commit time, before staff had
 * reviewed anything; that broke the link entirely, since resolveCardCode
 * (src/lib/card-lookup.ts) requires the order's payment_status to already
 * be 'fulfilled' before a card resolves at all — staff approval is what
 * sets that. Deliberately never says "tap to activate" or otherwise
 * implies the *physical* card is ready — that's the later, separately
 * staff-triggered claim-reminder email's job
 * (send-squad-invite-card-claim-reminder-email.ts), sent once the card is
 * actually produced. Same {toEmail, teamName, claimUrl} shape and
 * never-throws contract as that sibling module, deliberately not sharing
 * one function — different copy, different point in the lifecycle.
 */
export async function sendSquadInviteEarlyPreviewEmail(params: {
  toEmail: string;
  teamName: string;
  claimUrl: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping early preview email; the underlying state is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const team = escapeHtml(params.teamName);
  const subject = `Your Squad Invite card for ${params.teamName} has been approved`;
  const html = `<h2>Your card's been approved</h2><p>Emblem staff have reviewed and approved your child's card for <strong>${team}</strong> — it's now queued for production.</p><p>While you wait for the physical card, you can already preview the digital card and start exploring Player OS.</p><p><a href="${params.claimUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Preview your card</a></p><p style="color:#6b7280;font-size:13px">No payment has been taken. If you weren't expecting this email, you can ignore it.</p>`;
  const text = `Your card's been approved\n\nEmblem staff have reviewed and approved your child's card for ${params.teamName} — it's now queued for production.\n\nWhile you wait for the physical card, you can already preview the digital card and start exploring Player OS.\n\nPreview your card: ${params.claimUrl}\n\nNo payment has been taken. If you weren't expecting this email, you can ignore it.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html, text }),
    });
    if (!res.ok) {
      console.warn('Resend early preview email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend early preview email threw', err);
    return { ok: false };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

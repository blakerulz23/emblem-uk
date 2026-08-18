/**
 * Sends a Squad Invite guardian an early look at their child's card the
 * moment they commit it — before staff approval, before physical
 * production. "Claiming" (digital identity/Player OS access) and
 * production status are independent in this schema (see
 * commit_squad_invite_participation_order, migration 0055): the card row
 * and its claim_token already exist at commit time, and /os?card=...
 * already resolves an unclaimed card through the normal activation flow
 * with no approval/production precondition. Deliberately never says "tap
 * to activate" or otherwise implies a physical card exists yet — that's
 * the later, staff-triggered claim-reminder email's job
 * (send-squad-invite-card-claim-reminder-email.ts), once production is
 * real. Same {toEmail, teamName, claimUrl} shape and never-throws
 * contract as that sibling module, deliberately not sharing one function
 * — different copy, different point in the lifecycle.
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
  const subject = `Get an early look at your Squad Invite card for ${params.teamName}`;
  const html = `<h2>Your card design is saved</h2><p>Your child's card for <strong>${team}</strong> is saved. Emblem staff review it before it goes into production, but you can already preview the digital card and start exploring Player OS now.</p><p><a href="${params.claimUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Preview your card</a></p><p style="color:#6b7280;font-size:13px">No payment has been taken. If you weren't expecting this email, you can ignore it.</p>`;
  const text = `Your card design is saved\n\nYour child's card for ${params.teamName} is saved. Emblem staff review it before it goes into production, but you can already preview the digital card and start exploring Player OS now.\n\nPreview your card: ${params.claimUrl}\n\nNo payment has been taken. If you weren't expecting this email, you can ignore it.`;

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

/**
 * Sends the "a guardian invited you to connect as their child's coach"
 * email — a dedicated template, deliberately not sendInviteEmail's
 * (guardian-invite) copy or link. Same Resend HTTP API mechanism as
 * sendInviteEmail (this isn't a Supabase Auth email either), just its
 * own subject/body/URL: /os?coachinvite=<code>, never /os?invite=<code>.
 *
 * Never claims access already exists — the coach isn't connected until
 * they actually redeem the invite, so the copy only ever describes an
 * invitation, never a completed connection. Identifies the player by
 * firstName + lastInitial only (the same minimum-disclosure shape the
 * public GET /api/os/coach-invites/redeem lookup already uses) — never
 * the player's full name or any other private detail.
 *
 * Never throws — a failed or skipped send must not fail the caller; the
 * invite code is already valid in the database regardless of whether
 * this email lands, and the copyable link in the guardian's own UI
 * remains the fallback either way. Callers use the returned `ok` to
 * report emailStatus back to the guardian, not to decide whether the
 * invite itself succeeded.
 */
export async function sendCoachInviteEmail(
  toEmail: string,
  inviteCode: string,
  player: { firstName: string; lastInitial: string },
  guardianName: string | null
): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping coach invite email; the link is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  const inviteUrl = `${siteUrl}/os?coachinvite=${encodeURIComponent(inviteCode)}`;
  const playerLabel = `${player.firstName} ${player.lastInitial}.`;
  const fromWhom = guardianName?.trim() || 'A parent';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: toEmail,
        subject: `You've been invited to coach ${playerLabel} on Emblem`,
        html: `
          <h2>You've been invited to connect as a coach</h2>
          <p>${fromWhom} has invited you to connect as ${playerLabel}'s coach on Emblem — sharing development feedback, tracking progress, and recognising great moments.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Accept invitation</a></p>
          <p>Once you accept, you'll be connected as ${playerLabel}'s coach. This invitation expires in 7 days.</p>
          <p style="color:#888;font-size:13px">If you weren't expecting this, you can safely ignore this email.</p>
        `,
      }),
    });

    if (!res.ok) {
      console.warn('Resend coach invite email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // A thrown network error must not bubble up and fail the caller —
    // the invite row is already committed; this is best-effort delivery only.
    console.warn('Resend coach invite email threw', err);
    return { ok: false };
  }
}

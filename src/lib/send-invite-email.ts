/**
 * Sends the "you've been invited to set up your child's Emblem profile"
 * email directly via Resend's HTTP API — this isn't a Supabase Auth email
 * (no sign-in happening here), so it doesn't go through a Supabase email
 * template. Reuses the same Resend account already connected as Supabase's
 * custom SMTP provider.
 *
 * Never throws — a failed or skipped send must not fail the caller, since
 * the invite's claim code is already valid in the database regardless of
 * whether this email lands. Callers use the returned `ok` to record
 * player_invites.email_status for staff visibility/resend, not to decide
 * whether the invite itself succeeded.
 */
export async function sendInviteEmail(toEmail: string, inviteCode: string): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping invite email; the code above is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk.vercel.app';
  const inviteUrl = `${siteUrl}/os?invite=${encodeURIComponent(inviteCode)}`;

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
        subject: "You've been invited to set up an Emblem profile",
        html: `
          <h2>You've been invited</h2>
          <p>Someone has invited you to set up guardian access to a child's Emblem profile.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Set up the profile</a></p>
          <p>Or open Emblem, choose "I don't have my card," and enter this code:</p>
          <p style="font-size:20px;font-weight:700;letter-spacing:.2em">${inviteCode}</p>
        `,
      }),
    });

    if (!res.ok) {
      console.warn('Resend invite email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // A thrown network error must not bubble up and fail the caller — the
    // invite row is already committed; this is best-effort delivery only.
    console.warn('Resend invite email threw', err);
    return { ok: false };
  }
}

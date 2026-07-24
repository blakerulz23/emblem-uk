/**
 * Sends the "your squad's Emblem cards are ready to manage" email —
 * duplicates send-invite-email.ts's Resend-call scaffolding with
 * team-specific copy, since that function has no template parameter
 * (confirmed by direct read) and this is a distinct recipient/purpose,
 * not a variant of the same message.
 *
 * Never throws — a failed or skipped send must not fail the caller,
 * since the invite's code is already valid in the database regardless
 * of whether this email lands.
 */
export async function sendTeamInviteEmail(toEmail: string, inviteCode: string): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping team invite email; the code above is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk.vercel.app';
  const inviteUrl = `${siteUrl}/os?teaminvite=${encodeURIComponent(inviteCode)}`;

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
        subject: "Your squad's Emblem cards are ready to manage",
        html: `
          <h2>Your team's ready</h2>
          <p>Your squad's Emblem cards have been approved. Set up Coach OS to manage your players' profiles.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Set up Coach OS</a></p>
          <p>Or open Emblem and enter this code:</p>
          <p style="font-size:20px;font-weight:700;letter-spacing:.2em">${inviteCode}</p>
        `,
      }),
    });

    if (!res.ok) {
      console.warn('Resend team invite email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend team invite email threw', err);
    return { ok: false };
  }
}

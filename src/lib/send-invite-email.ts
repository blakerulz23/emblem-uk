/**
 * Sends the "you've been invited to set up your child's Emblem profile"
 * email directly via Resend's HTTP API — this isn't a Supabase Auth email
 * (no sign-in happening here), so it doesn't go through a Supabase email
 * template. Reuses the same Resend account already connected as Supabase's
 * custom SMTP provider.
 */
export async function sendInviteEmail(toEmail: string, inviteCode: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping invite email; the code above is still valid.');
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';

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
        <p>Open Emblem, choose "I don't have my card," and enter this code:</p>
        <p style="font-size:20px;font-weight:700;letter-spacing:.2em">${inviteCode}</p>
      `,
    }),
  });

  if (!res.ok) {
    console.warn('Resend invite email failed', await res.text().catch(() => ''));
  }
}

/**
 * Sends the guardian-approval request email when a non-guardian adult
 * (coach/club organiser/other) submits an ordinary-builder order (migration
 * 0071). Never contains the child's name, photo, or any card detail —
 * only enough for the guardian to decide whether to open the link, same
 * minimisation discipline as every Squad Invite lifecycle email
 * (send-squad-invite-notification-email.ts). Same {ok:boolean}, never-
 * throws contract as every other email sender in this codebase.
 */
export async function sendBuilderGuardianApprovalEmail(params: {
  toEmail: string;
  approveUrl: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping guardian approval email; the underlying state is still valid.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const subject = 'Approval needed for a personalised card';
  const html = `<h2>Approval needed</h2><p>An adult has started creating a personalised Emblem card and named you as the player's parent or legal guardian.</p><p>Before this card can be produced, we need your confirmation.</p><p><a href="${params.approveUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Review and respond</a></p><p style="color:#6b7280;font-size:13px">If you weren't expecting this email, you can ignore it — no card will be produced without your approval.</p>`;
  const text = `Approval needed\n\nAn adult has started creating a personalised Emblem card and named you as the player's parent or legal guardian.\n\nBefore this card can be produced, we need your confirmation.\n\nReview and respond: ${params.approveUrl}\n\nIf you weren't expecting this email, you can ignore it — no card will be produced without your approval.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html, text }),
    });
    if (!res.ok) {
      console.warn('Resend guardian approval email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend guardian approval email threw', err);
    return { ok: false };
  }
}

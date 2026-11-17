/**
 * Tells the adult who made a gift card (coach, club organiser or other
 * adult, migration 0071) that the parent or guardian they named has
 * responded. Sent once, from POST /api/builder-authority/guardian-respond,
 * to the buyer's verified declaration email.
 *
 * Same minimisation as send-builder-guardian-approval-email.ts: no child
 * name, photo, order reference, guardian address or card detail. The
 * approved email links to /builder?pay=1, where the buyer confirms their
 * email with a code and sees their own unpaid order (unpaid-order-recovery.ts);
 * nothing in the link identifies the order. The declined email gives no
 * reason. Same {ok:boolean}, never-throws contract as every other sender.
 */
export async function sendBuilderGuardianDecisionEmail(params: {
  toEmail: string;
  decision: 'approved' | 'declined';
  payUrl: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping guardian decision email; the decision itself is still recorded.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const content = params.decision === 'approved' ? approvedContent(params.payUrl) : declinedContent();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject: content.subject, html: content.html, text: content.text }),
    });
    if (!res.ok) {
      console.warn('Resend guardian decision email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend guardian decision email threw', err);
    return { ok: false };
  }
}

function approvedContent(payUrl: string) {
  const subject = 'Your Emblem card has been approved';
  const html = `<h2>Good news: your card has been approved</h2><p>The parent or guardian you named has approved the personalised Emblem card you made.</p><p>To finish your order, pay for it here. You'll confirm your email with a code, then you'll see the order waiting for you.</p><p><a href="${payUrl}" style="display:inline-block;padding:12px 20px;background:#E97435;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Pay for your order</a></p><p>Once it's paid, we'll make the card and send it to the address you give at checkout. We'll email the parent or guardian separately to set up the player's Emblem profile, which they control.</p><p style="color:#6b7280;font-size:13px">Nothing has been charged yet.</p>`;
  const text = `Good news: your card has been approved\n\nThe parent or guardian you named has approved the personalised Emblem card you made.\n\nTo finish your order, pay for it here. You'll confirm your email with a code, then you'll see the order waiting for you.\n\nPay for your order: ${payUrl}\n\nOnce it's paid, we'll make the card and send it to the address you give at checkout. We'll email the parent or guardian separately to set up the player's Emblem profile, which they control.\n\nNothing has been charged yet.`;
  return { subject, html, text };
}

function declinedContent() {
  const subject = 'An update on your Emblem card';
  const html = `<h2>Your card won't be made</h2><p>The parent or guardian you named has decided not to go ahead with the personalised Emblem card you made, so we won't produce it.</p><p>You haven't been charged anything, and there's nothing more you need to do.</p><p style="color:#6b7280;font-size:13px">Thank you for checking with them first.</p>`;
  const text = `Your card won't be made\n\nThe parent or guardian you named has decided not to go ahead with the personalised Emblem card you made, so we won't produce it.\n\nYou haven't been charged anything, and there's nothing more you need to do.\n\nThank you for checking with them first.`;
  return { subject, html, text };
}

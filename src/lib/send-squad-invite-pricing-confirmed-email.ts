/**
 * Sends every committed parent in a campaign their confirmed price the
 * moment staff finalise it (finalise-pricing/route.ts, only on a genuine
 * first finalisation). Distinct from send-squad-invite-payment-request-
 * email.ts: this fires unconditionally, regardless of whether the payment
 * wall (squad_invite_payment_mode_enabled()) is on — it's the price
 * confirmation ("here's your price"), never a bill. Never says pay now,
 * never carries a payment link or a deadline. Prices are always taken
 * from the caller's params (the campaign row's own final_unit_price_pence,
 * via the RPC response) — never hardcoded here, same discipline
 * migration-0050-contract.test.ts now enforces against pricing-engine.ts.
 *
 * The /os?card=... link is a plain "see your child's card" pointer, not a
 * call to action — deliberately not styled as a button the way the
 * claim-reminder/early-preview emails' links are, so a price confirmation
 * doesn't read like the next step in a checkout.
 */
export async function sendSquadInvitePricingConfirmedEmail(params: {
  toEmail: string;
  teamName: string;
  committedCount: number;
  unitPricePence: number;
  tier: 'single' | 'multi' | 'squad';
  claimUrl: string;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping Squad Invite pricing confirmed email.');
    return { ok: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Emblem <onboarding@resend.dev>';
  const team = escapeHtml(params.teamName);
  const price = formatPence(params.unitPricePence);
  const subject = `Your Squad Invite price for ${params.teamName} is confirmed: ${price} per card`;

  // Every recipient in a campaign gets identical copy — pricing is
  // computed once, campaign-wide, never per participant (see
  // finalise_squad_invite_pricing, migration 0050). Deliberately doesn't
  // say "the team finished with 1 player" in the single-tier case:
  // orders are already closed by the time this sends, there's nothing
  // left to act on, and framing headcount as a shortfall reads as a
  // penalty for something the recipient can't change.
  const bodyHtml = params.tier === 'single'
    ? `Orders for <strong>${team}</strong> are now closed. Your price is <strong>${price} per card</strong>.`
    : `Orders for <strong>${team}</strong> are now closed. The team finished with <strong>${params.committedCount} players</strong> — because you committed early and the team grew, everyone's price came down to <strong>${price} per card</strong>, less than ordering on your own.`;
  const bodyText = params.tier === 'single'
    ? `Orders for ${params.teamName} are now closed. Your price is ${price} per card.`
    : `Orders for ${params.teamName} are now closed. The team finished with ${params.committedCount} players — because you committed early and the team grew, everyone's price came down to ${price} per card, less than ordering on your own.`;

  const html = `<h2>Your price is confirmed</h2><p>${bodyHtml}</p><p><a href="${params.claimUrl}" style="color:#E97435;font-weight:700">See your child's card</a></p><p style="color:#6b7280;font-size:13px">No payment has been taken. If you weren't expecting this email, you can ignore it.</p>`;
  const text = `Your price is confirmed\n\n${bodyText}\n\nSee your child's card: ${params.claimUrl}\n\nNo payment has been taken. If you weren't expecting this email, you can ignore it.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.toEmail, subject, html, text }),
    });
    if (!res.ok) {
      console.warn('Resend Squad Invite pricing confirmed email failed', await res.text().catch(() => ''));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Resend Squad Invite pricing confirmed email threw', err);
    return { ok: false };
  }
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

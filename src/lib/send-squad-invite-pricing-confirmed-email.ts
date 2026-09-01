import { SINGLE_UNIT_PRICE_PENCE } from './pricing-engine';

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
 * Deliberately carries no /os?card=... link. That link only ever resolves
 * once the order reaches payment_status = 'fulfilled' (card-lookup.ts's
 * orderApproved check) — genuinely unreachable at this point in the
 * lifecycle, since this email fires before anyone has even paid. Every
 * real recipient who clicked it hit "That code isn't recognised", found
 * live during a real walkthrough. The correctly-timed equivalent —
 * sendSquadInviteEarlyPreviewEmail's "Preview your card", which *does*
 * link to the full OS — only fires later, once staff approve the card
 * into production (payment done, order genuinely fulfilled). This email
 * stays a pure price notification; it never promises a preview it can't
 * deliver.
 */
export async function sendSquadInvitePricingConfirmedEmail(params: {
  toEmail: string;
  teamName: string;
  committedCount: number;
  unitPricePence: number;
  tier: 'single' | 'multi' | 'squad';
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
  // finalise_squad_invite_pricing, migration 0050), so this never implies
  // a price that "came down" or changed over time — nothing moved, it was
  // one computation from the final count. The multi/squad framing is
  // "ordering together got you a lower price than ordering alone," a
  // static comparison, not a claim about movement. Single-tier
  // deliberately doesn't say "the team finished with 1 player" either:
  // orders are already closed by the time this sends, there's nothing
  // left to act on, and framing headcount as a shortfall reads as a
  // penalty for something the recipient can't change.
  const savings = formatPence(SINGLE_UNIT_PRICE_PENCE - params.unitPricePence);
  const bodyHtml = params.tier === 'single'
    ? `Orders for <strong>${team}</strong> are now closed. Your price is <strong>${price} per card</strong>.`
    : `Orders for <strong>${team}</strong> are now closed. Because <strong>${params.committedCount} of you</strong> ordered together, everyone's price is <strong>${price} per card</strong> — <strong>${savings}</strong> less than ordering alone.`;
  const bodyText = params.tier === 'single'
    ? `Orders for ${params.teamName} are now closed. Your price is ${price} per card.`
    : `Orders for ${params.teamName} are now closed. Because ${params.committedCount} of you ordered together, everyone's price is ${price} per card — ${savings} less than ordering alone.`;

  const html = `<h2>Your price is confirmed</h2><p>${bodyHtml}</p><p style="color:#6b7280;font-size:13px">No payment has been taken. If you weren't expecting this email, you can ignore it.</p>`;
  const text = `Your price is confirmed\n\n${bodyText}\n\nNo payment has been taken. If you weren't expecting this email, you can ignore it.`;

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

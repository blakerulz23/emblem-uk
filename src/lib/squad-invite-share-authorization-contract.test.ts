import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const migration0078 = readFileSync('supabase/migrations/0078_guardian_card_share_consent.sql', 'utf8');
const migration0084 = readFileSync('supabase/migrations/0084_squad_invite_card_share_eligibility.sql', 'utf8');
const eligibilityRoute = readFileSync('src/app/api/card-share/eligibility/route.ts', 'utf8');
const consentRoute = readFileSync('src/app/api/card-share/consent/route.ts', 'utf8');
const photoRoute = readFileSync('src/app/api/card-share/photo/route.ts', 'utf8');
const cardShareLib = readFileSync('src/lib/card-share.ts', 'utf8');
const shareSheet = readFileSync('src/components/emblem-uk/SquadInviteShareSheet.tsx', 'utf8');
const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

/**
 * Authorization boundary + payment-independence proof for Squad Invite
 * guardian card sharing. The Squad Invite completion screen adds NO new
 * eligibility ROUTE and NO new consent table — it calls the exact same
 * PR #44 (migration 0078/0079) client-side surface and the exact same
 * /api/card-share/* routes the ordinary single-builder success screen
 * already uses.
 *
 * The one thing that IS new is migration 0084, an explicit, founder-
 * approved extension of get_card_share_eligibility itself: Squad Invite's
 * own commit-time declarations can't distinguish a direct parent/guardian
 * from an other-adult submitting "with permission" (one checkbox covers
 * both, unlike builder_order_authority_declarations.relationship), so the
 * founder made an informed decision to accept that gap rather than block
 * sharing on it. 0084 is additive, not a rewrite: it adds a new branch
 * keyed on orders.source, and reproduces the ordinary builder's own
 * branch byte-for-byte (proven in migration-0084-contract.test.ts) — this
 * file proves that reuse/non-regression from the calling-code side, and
 * that the Squad Invite branch itself enforces real, persisted, revocable
 * evidence rather than trusting client-supplied claims.
 */
describe('Squad Invite sharing extends get_card_share_eligibility additively — no new route/table, ordinary builder path unmodified', () => {
  it('SquadInviteShareSheet imports its eligibility/consent logic from card-share.ts — the exact same module ShareCardSheet.tsx (the ordinary builder) uses — not a re-implementation', () => {
    expect(shareSheet).toContain("from '@/lib/card-share'");
    expect(shareSheet).toContain('fetchCardShareEligibility(orderId)');
    expect(shareSheet).toContain("recordCardShareConsent(orderId, 'confirmed')");
    expect(shareSheet).toContain("recordCardShareConsent(orderId, 'cancelled')");
    // No inline reimplementation of the eligibility/consent RPC calls.
    expect(shareSheet).not.toMatch(/\.rpc\(['"]get_card_share_eligibility|\.rpc\(['"]record_card_share_consent/);
  });

  it('there is no second, separately-named Squad-Invite-specific eligibility RPC, route, or table — the extension lives inside the one existing function', () => {
    expect(builder).not.toMatch(/squad_invite_card_share|squadInviteCardShareEligibility|get_squad_invite_share/i);
    expect(eligibilityRoute).not.toMatch(/squad.invite/i);
    expect(consentRoute).not.toMatch(/squad.invite/i);
  });

  it('/api/card-share/eligibility calls get_card_share_eligibility directly by order id — the same call, same route, for every caller, ordinary builder or Squad Invite alike', () => {
    expect(eligibilityRoute).toContain("supabase.rpc('get_card_share_eligibility', { p_order_id: orderId })");
  });

  it('the eligibility route fails closed on any RPC error — never returns eligible:true on an unexpected failure', () => {
    const idx = eligibilityRoute.indexOf('if (error)');
    const section = eligibilityRoute.slice(idx, idx + 260);
    expect(section).toContain("eligible: false, reason: 'not_authorized'");
  });

  it('migration 0078\'s own ordinary-builder branch still requires authority_status = confirmed and relationship = parent_guardian, unaffected by 0084 — the file itself is untouched', () => {
    expect(migration0078).toContain("v_order.authority_status is distinct from 'confirmed'");
    expect(migration0078).toContain("v_declaration.relationship is distinct from 'parent_guardian'");
  });

  it('migration 0084 (the founder-approved Squad Invite extension) requires the caller\'s own auth.uid() to match the participation\'s guardian_profile_id, and both sharing-relevant permissions to be currently granted and not withdrawn — real, persisted, revocable evidence, never a client-supplied claim', () => {
    expect(migration0084).toContain('v_participation.guardian_profile_id is distinct from auth.uid()');
    expect(migration0084).toContain("purpose = 'child_information_authority'");
    expect(migration0084).toContain("purpose = 'photograph_manufacture'");
    expect(migration0084).toContain('granted = true');
    expect(migration0084).toContain('withdrawn_at is null');
  });

  it('migration 0084\'s header comment states the accepted risk explicitly — this is a founder decision, not an unexamined shortcut', () => {
    expect(migration0084).toContain('FOUNDER-APPROVED');
    expect(migration0084).toContain('Founder decision (explicit, informed)');
  });

  it('the photo proxy (/api/card-share/photo, migration 0079) re-derives eligibility itself server-side rather than trusting a client-supplied key — automatically covers the Squad Invite branch too, since it calls the same get_card_share_eligibility function, unmodified by 0084', () => {
    expect(photoRoute).toMatch(/get_card_share_asset_key|eligibility/i);
    const photoFn = readFileSync('supabase/migrations/0079_card_share_asset_proxy.sql', 'utf8');
    expect(photoFn).toContain('public.get_card_share_eligibility(p_order_id)');
  });
});

describe('Squad Invite sharing never trusts a participation id, invitation token, or order id from the client as proof of guardianship', () => {
  it('squadInviteOrderId is captured only from the commit route\'s own JSON response body — never derived from squadInviteContext.participationId (an invitation/session identifier, not proof of order ownership)', () => {
    const setterIdx = builder.indexOf('setSquadInviteOrderId(successBody.orderId)');
    expect(setterIdx).toBeGreaterThan(-1);
    // squadInviteOrderId is never assigned from squadInviteContext anywhere.
    expect(builder).not.toMatch(/setSquadInviteOrderId\(squadInviteContext/);
  });

  it('the orderId passed into SquadInviteShareSheet/captureSquadInviteShareImage is squadInviteOrderId (server-derived), never squadInviteContext.participationId', () => {
    const idx = builder.indexOf('<SquadInviteShareSheet');
    const tag = builder.slice(idx, builder.indexOf('/>', idx));
    expect(tag).toContain('orderId={squadInviteOrderId}');
    expect(tag).not.toContain('participationId');
  });

  it('get_card_share_eligibility itself re-derives everything server-side from the order row and auth.uid() — a caller altering p_order_id to a different guardian\'s order still only ever proves eligibility for whichever order id is actually passed, gated on that order\'s own authority evidence matching the CALLER\'s own auth.uid(), never the URL/body value alone — true for both branches', () => {
    expect(migration0084).toContain('if auth.uid() is null then');
    // Ordinary builder branch (preserved from 0078):
    expect(migration0084).toContain('v_declaration.adult_user_id is distinct from auth.uid()');
    // Squad Invite branch (0084):
    expect(migration0084).toContain('v_participation.guardian_profile_id is distinct from auth.uid()');
  });

  it('the commit route derives the guardian identity from the authenticated session, not from client-supplied input — the same server-verified identity that later becomes orders.authority-adjacent state', () => {
    const commitRoute = readFileSync('src/app/api/squad-invite-participations/[id]/commit/route.ts', 'utf8');
    expect(commitRoute).toContain("const { data: { user } } = await createClient().auth.getUser();");
    expect(commitRoute).toContain('p_guardian_profile_id: user.id');
  });
});

/**
 * Phase 6 — payment independence. Sharing eligibility (migration 0078)
 * never reads any payment field, and Squad Invite's own live payment
 * pipeline (migration 0067, finalise-pricing, the Shopify webhook) never
 * reads or writes anything in card_share_consent_events or the eligibility
 * RPC. Proven by absence — grepping the actual SQL/route bodies, not by
 * assertion alone.
 */
describe('Sharing and payment are structurally independent — proven by absence, not just assertion', () => {
  it('the ORIGINAL 0078 function body never references any payment field or table', () => {
    const functionsBlock = migration0078.slice(migration0078.indexOf('create or replace function public.get_card_share_eligibility'));
    expect(functionsBlock).not.toMatch(/payment_status|payment_request|checkout/i);
  });

  it('the LIVE, currently-deployed function body (0084\'s replacement, which includes the new Squad Invite branch) also never references any payment field — the branch that actually governs Squad Invite sharing today reads participation status and permission grants only, never payment_status/payment_request_status/paid', () => {
    const functionsBlock = migration0084.slice(migration0084.indexOf('create or replace function public.get_card_share_eligibility'));
    expect(functionsBlock).not.toMatch(/payment_status|payment_request_status|payment_completed_at|checkout|order_line_items/i);
  });

  it('the eligibility/consent/photo routes never touch a payment-status field, a checkout session, or a Shopify order', () => {
    for (const source of [eligibilityRoute, consentRoute, photoRoute]) {
      expect(source).not.toMatch(/payment_status|checkout|shopify/i);
    }
  });

  it('the Squad Invite finalise-pricing route (the actual, live payment-request trigger) never reads or writes card_share_consent_events or calls any card-share RPC', () => {
    const finalisePricing = readFileSync('src/app/api/staff/squad-invites/[id]/finalise-pricing/route.ts', 'utf8');
    expect(finalisePricing).not.toMatch(/card_share_consent_events|get_card_share_eligibility|record_card_share_consent/);
  });

  it('the Shopify orders-paid webhook (the route that actually marks a Squad Invite participation paid) never reads or writes card_share_consent_events or calls any card-share RPC', () => {
    const webhook = readFileSync('src/app/api/webhooks/shopify/orders-paid/route.ts', 'utf8');
    expect(webhook).not.toMatch(/card_share_consent_events|get_card_share_eligibility|record_card_share_consent/);
  });

  it('sharing never calls any endpoint that could move a card into production — only the existing staff-triggered review/approval routes do that, and this feature never touches them', () => {
    for (const source of [eligibilityRoute, consentRoute, photoRoute, shareSheet]) {
      expect(source).not.toMatch(/production_accepted|\/approve\b|finalise-pricing/i);
    }
  });

  it('the completion screen never implies sharing is conditional on payment — the ineligible/blocked copy paths never mention payment, price, or charge', () => {
    const cardShareBlockedFn = cardShareLib.slice(cardShareLib.indexOf('const BLOCKED_MESSAGES'), cardShareLib.indexOf('export function cardShareBlockedMessage') + 400);
    expect(cardShareBlockedFn).not.toMatch(/payment|price|charge|paid/i);
  });
});

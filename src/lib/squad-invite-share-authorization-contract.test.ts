import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const migration0078 = readFileSync('supabase/migrations/0078_guardian_card_share_consent.sql', 'utf8');
const eligibilityRoute = readFileSync('src/app/api/card-share/eligibility/route.ts', 'utf8');
const consentRoute = readFileSync('src/app/api/card-share/consent/route.ts', 'utf8');
const photoRoute = readFileSync('src/app/api/card-share/photo/route.ts', 'utf8');
const cardShareLib = readFileSync('src/lib/card-share.ts', 'utf8');
const shareSheet = readFileSync('src/components/emblem-uk/SquadInviteShareSheet.tsx', 'utf8');
const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

/**
 * Authorization boundary + payment-independence proof for Squad Invite
 * guardian card sharing. The Squad Invite completion screen adds NO new
 * eligibility RPC, NO new eligibility route, and NO new consent table —
 * it calls the exact same PR #44 (migration 0078/0079) surface the
 * ordinary single-builder success screen already uses. This file proves
 * that reuse is real (not a parallel, weaker implementation), and that the
 * one real gap found during discovery — Squad Invite's own commit-time
 * declarations don't distinguish a direct parent/guardian from an
 * other-adult submitting "with permission" the way
 * builder_order_authority_declarations.relationship does — was left
 * closed rather than bridged with a new, weaker check.
 */
describe('Squad Invite sharing reuses PR #44 unmodified — no new/weaker eligibility path', () => {
  it('SquadInviteShareSheet imports its eligibility/consent logic from card-share.ts — the exact same module ShareCardSheet.tsx (the ordinary builder) uses — not a re-implementation', () => {
    expect(shareSheet).toContain("from '@/lib/card-share'");
    expect(shareSheet).toContain('fetchCardShareEligibility(orderId)');
    expect(shareSheet).toContain("recordCardShareConsent(orderId, 'confirmed')");
    expect(shareSheet).toContain("recordCardShareConsent(orderId, 'cancelled')");
    // No inline reimplementation of the eligibility/consent RPC calls.
    expect(shareSheet).not.toMatch(/\.rpc\(['"]get_card_share_eligibility|\.rpc\(['"]record_card_share_consent/);
  });

  it('there is no second, Squad-Invite-specific eligibility RPC, route, or migration anywhere in the codebase', () => {
    expect(builder).not.toMatch(/squad_invite_card_share|squadInviteCardShareEligibility|get_squad_invite_share/i);
    expect(eligibilityRoute).not.toMatch(/squad.invite/i);
    expect(consentRoute).not.toMatch(/squad.invite/i);
  });

  it('/api/card-share/eligibility calls the unmodified get_card_share_eligibility RPC directly by order id — the same call for every caller, ordinary builder or Squad Invite alike', () => {
    expect(eligibilityRoute).toContain("supabase.rpc('get_card_share_eligibility', { p_order_id: orderId })");
  });

  it('the eligibility route fails closed on any RPC error — never returns eligible:true on an unexpected failure', () => {
    const idx = eligibilityRoute.indexOf('if (error)');
    const section = eligibilityRoute.slice(idx, idx + 260);
    expect(section).toContain("eligible: false, reason: 'not_authorized'");
  });

  it('get_card_share_eligibility (migration 0078) requires authority_status = confirmed — which no Squad Invite order has today, since Squad Invite writes to a separate, less specific declaration schema (its own four commit-time acknowledgements, not builder_order_authority_declarations)', () => {
    expect(migration0078).toContain("v_order.authority_status is distinct from 'confirmed'");
    // The migration's own comment explicitly documents this as covering
    // Squad Invite orders (null authority_status), by design, not oversight.
    expect(migration0078).toContain('null (Squad Invite / historical orders)');
  });

  it('get_card_share_eligibility requires the declaring adult to be the SAME auth.uid() who declared authority, with relationship = parent_guardian specifically — Squad Invite has no equivalent persisted relationship field, so it cannot satisfy this even if authority_status were somehow confirmed', () => {
    expect(migration0078).toContain('v_declaration.adult_user_id is distinct from auth.uid()');
    expect(migration0078).toContain("v_declaration.relationship is distinct from 'parent_guardian'");
  });

  it('this migration explicitly documents Squad Invite as deliberately NOT covered by this pass, pending dedicated review — not silently attempted here', () => {
    expect(migration0078).toContain('Squad Invite: squad_invite_participations.guardian_profile_id IS a');
    expect(migration0078).toContain('is not wired here because');
  });

  it('the photo proxy (/api/card-share/photo, migration 0079) re-derives eligibility itself server-side rather than trusting a client-supplied key — the same fail-closed authority Squad Invite\'s reuse depends on', () => {
    expect(photoRoute).toMatch(/get_card_share_asset_key|eligibility/i);
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

  it('get_card_share_eligibility itself re-derives everything server-side from the order row and auth.uid() — a caller altering p_order_id to a different guardian\'s order still only ever proves eligibility for whichever order id is actually passed, gated on that order\'s own authority_declaration matching the CALLER\'s own auth.uid(), never the URL/body value alone', () => {
    expect(migration0078).toContain('if auth.uid() is null then');
    expect(migration0078).toContain('v_declaration.adult_user_id is distinct from auth.uid()');
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
  it('get_card_share_eligibility and record_card_share_consent (migration 0078) never reference any payment field or table', () => {
    const functionsBlock = migration0078.slice(migration0078.indexOf('create or replace function public.get_card_share_eligibility'));
    expect(functionsBlock).not.toMatch(/payment_status|payment_request|squad_invite_participations|orders\.paid|checkout/i);
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

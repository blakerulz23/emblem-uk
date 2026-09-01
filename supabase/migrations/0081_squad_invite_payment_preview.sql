-- Squad Invite "Pay now" currently drops a cold email visitor straight onto
-- Shopify's bare cart page — no confirmation of which child's card they're
-- actually paying for, unlike the ordinary builder's Gate 3 flow, which
-- always shows an "Order received" screen with the real card art first.
-- This migration adds the minimal server-side plumbing for a preview page
-- to sit in between: a per-participation bearer token (mirroring
-- squad_invite_links' own token-hash pattern exactly, since that link
-- already solves the same problem — a cold, unauthenticated visitor must
-- resolve to private, name-and-photo-bearing data, safely), issued in the
-- same atomic step that already issues the 72-hour payment window, and a
-- read-only resolver RPC that returns just enough to render the card and
-- rebuild the same Shopify checkout URl the app already builds today.
--
-- Deliberately independent of the guardian card-front sharing work (the
-- eligibility/consent objects from migrations 0078/0079) and of Gate 3's
-- webhook-verified payment state machine (the checkout/payment objects
-- from migration 0080) — this is a third, unrelated read-only preview
-- mechanism, scoped only to Squad Invite's existing bare-cart-permalink
-- checkout, which this migration does not change.

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — one more nullable column on squad_invite_participations, same
-- check-constraint shape as squad_invite_links.token_hash (0050-era
-- pattern: sha256 hex digest, unique, nullable until issued).
-- ----------------------------------------------------------------------------
alter table public.squad_invite_participations
  add column payment_preview_token_hash text unique
  check (payment_preview_token_hash is null or payment_preview_token_hash ~ '^[a-f0-9]{64}$');

comment on column public.squad_invite_participations.payment_preview_token_hash is
  'SHA-256 hex digest of a one-time-issued bearer token (see squad-invite-payment-preview-token.ts), set by issue_squad_invite_payment_request alongside the 72-hour payment window it already opens. Never the raw token itself — resolve_squad_invite_payment_preview hashes an incoming token and compares against this column, the same discipline squad_invite_links.token_hash already uses.';

-- ----------------------------------------------------------------------------
-- Part 2 — widen the audit event-type check (drop + re-add, same as every
-- prior widening of this constraint in 0057/0059/etc.) to add one new
-- value for the preview being opened. Issuance is already covered by the
-- existing 'payment_requested' event; this covers resolution/view,
-- mirroring resolve_squad_invite_link's own 'resolved' audit insert.
-- ----------------------------------------------------------------------------
alter table public.squad_invite_audit_events
  drop constraint squad_invite_audit_events_event_type_check,
  add constraint squad_invite_audit_events_event_type_check
    check (event_type = any (array[
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested','payment_preview_opened'
    ]));

-- ----------------------------------------------------------------------------
-- Part 3 — issue_squad_invite_payment_request gains a second parameter.
-- Postgres can't change an existing function's parameter list via `create
-- or replace` without risking a co-existing overload (PostgREST would then
-- see two candidates and refuse to pick), so the old 1-arg signature is
-- dropped first. Body is identical to 0057's version, plus setting the new
-- token hash in the SAME atomic update — not a second RPC call — so there
-- is no new "issued but not fully wired" partial-failure window beyond the
-- one 0057's own comment already documents as accepted.
-- ----------------------------------------------------------------------------
drop function if exists public.issue_squad_invite_payment_request(uuid);

create or replace function public.issue_squad_invite_payment_request(
  p_participation_id uuid,
  p_preview_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_campaign public.squad_invites%rowtype;
begin
  if p_preview_token_hash is null or p_preview_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid preview token hash';
  end if;

  select * into v_participation from public.squad_invite_participations where id = p_participation_id for update;
  if not found then raise exception 'participation not found'; end if;
  if v_participation.status not in ('commitment_completed','payment_request_pending') then
    raise exception 'participation is not eligible for a payment request';
  end if;
  select * into v_campaign from public.squad_invites where id = v_participation.campaign_id for update;
  if not found or v_campaign.pricing_finalised_at is null or v_campaign.final_unit_price_pence is null then
    raise exception 'campaign pricing has not been finalised';
  end if;
  update public.squad_invite_participations set
    status = 'payment_requested',
    payment_request_status = 'issued',
    payment_request_issued_at = now(),
    payment_deadline_at = now() + interval '72 hours',
    payment_preview_token_hash = p_preview_token_hash,
    updated_at = now()
  where id = p_participation_id;
  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_role, event_type, metadata)
  values (v_participation.campaign_id, p_participation_id, 'system', 'payment_requested',
    jsonb_build_object('finalUnitPricePence', v_campaign.final_unit_price_pence, 'finalTier', v_campaign.final_tier));
  return jsonb_build_object(
    'ok', true, 'orderId', v_participation.order_id,
    'printQuantity', v_participation.print_quantity,
    'finalUnitPricePence', v_campaign.final_unit_price_pence
  );
end;
$$;
alter function public.issue_squad_invite_payment_request(uuid, text) owner to postgres;
revoke all on function public.issue_squad_invite_payment_request(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_squad_invite_payment_request(uuid, text) to service_role;

comment on function public.issue_squad_invite_payment_request(uuid, text) is
  'Locks in one participation''s 72-hour payment window AND its payment-preview token hash in one atomic update, and returns what its caller needs to build both the preview page link and (from inside the preview page''s own resolve step) the eventual Shopify payment link. Never itself creates a Shopify link, a preview-page URL, or sends anything — that is application-layer.';

-- ----------------------------------------------------------------------------
-- Part 4 — resolve_squad_invite_payment_preview: the read-only resolver a
-- cold, unauthenticated visitor's token round-trips through. Same fail-
-- closed, generically-uninformative-on-failure shape as
-- resolve_squad_invite_link (never distinguishes "wrong token" from
-- "expired" from "already paid" to the caller) and the same explicit
-- field allowlist discipline as assertSafeSquadInviteProjection on the
-- TypeScript side — this function is the one place that allowlist is
-- actually enforced, by construction (only these fields are ever selected
-- into the returned jsonb).
-- ----------------------------------------------------------------------------
create or replace function public.resolve_squad_invite_payment_preview(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_campaign public.squad_invites%rowtype;
  v_order record;
  v_card record;
begin
  -- Not STABLE: this function writes an audit event on every successful
  -- resolve (matching resolve_squad_invite_link's own 'resolved' insert,
  -- which is likewise a plain volatile function, not STABLE).
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return null;
  end if;

  select * into v_participation
  from public.squad_invite_participations
  where payment_preview_token_hash = p_token_hash;

  if v_participation.id is null then
    return null;
  end if;

  -- Reachable through 'paid' too (not just 'payment_requested') so a
  -- parent who already paid and re-opens the emailed link sees an
  -- "already paid" state rather than a dead link — the API/page layer
  -- decides how to render that, this function just reports status
  -- honestly either way.
  if v_participation.status not in ('payment_requested', 'paid') then
    return null;
  end if;
  if v_participation.status = 'payment_requested'
     and (v_participation.payment_deadline_at is null or v_participation.payment_deadline_at <= now()) then
    return null;
  end if;

  select * into v_campaign from public.squad_invites where id = v_participation.campaign_id;
  if v_campaign.id is null or v_campaign.final_tier is null or v_campaign.final_unit_price_pence is null then
    return null;
  end if;

  select id, order_ref into v_order from public.orders where id = v_participation.order_id;
  if v_order.id is null then
    return null;
  end if;

  select template_id, sport, name, number, team, "position", logo, photo, stats
  into v_card
  from public.card_definitions
  where order_id = v_participation.order_id
  order by created_at desc
  limit 1;

  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_role, event_type, metadata)
  values (v_participation.campaign_id, v_participation.id, 'parent', 'payment_preview_opened', '{}'::jsonb);

  return jsonb_build_object(
    'status', v_participation.status,
    'teamName', v_campaign.club_team_name,
    'tier', v_campaign.final_tier,
    'unitPricePence', v_campaign.final_unit_price_pence,
    'printQuantity', v_participation.print_quantity,
    'totalPence', v_campaign.final_unit_price_pence * v_participation.print_quantity,
    'deadlineAt', v_participation.payment_deadline_at,
    'orderRef', v_order.order_ref,
    'card', case when v_card.template_id is null then null else jsonb_build_object(
      'templateId', v_card.template_id,
      'sport', v_card.sport,
      'name', v_card.name,
      'number', v_card.number,
      'team', v_card.team,
      'position', v_card."position",
      'logo', v_card.logo,
      'photoStorageKey', v_card.photo ->> 'storageKey',
      'photoCrop', v_card.photo -> 'crop',
      'stats', v_card.stats
    ) end
  );
end;
$$;

revoke all on function public.resolve_squad_invite_payment_preview(text) from public, anon, authenticated;
grant execute on function public.resolve_squad_invite_payment_preview(text) to service_role;

comment on function public.resolve_squad_invite_payment_preview(text) is
  'Read-only, token-gated. Returns a fixed, explicit field allowlist only — orderRef is included so the calling API route can rebuild the exact same Shopify checkout URL buildSquadInvitePaymentUrl already builds today, but purchaser_email/order_id/participation_id are never returned. Records a payment_preview_opened audit event on every successful resolve. Fails closed (returns null) for a wrong/malformed/expired/ineligible token — never distinguishes why, matching resolve_squad_invite_link''s own deliberately uninformative failure shape.';

commit;

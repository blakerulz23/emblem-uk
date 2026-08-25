-- ============================================================================
-- Guardian-controlled card-front sharing — Work Package B (draft, unreleased).
--
-- Stacked on migration 0071 (Adult Permission / authority) and 0075 (card
-- lifecycle). This package does not create, store, or ever return the
-- generated share image — the image is rendered client-side, in memory,
-- from the same CardFace component the builder already uses for on-screen
-- and print rendering (unmodified, byte-identical — see this branch's own
-- protected-areas test). This migration only records: (1) whether a given
-- order/card is currently eligible for sharing, computed fresh on every
-- call, never cached or trusted from an earlier check; and (2) an append-
-- only consent event once a guardian actually completes or cancels the
-- share confirmation.
--
-- AUTHORIZATION MODEL — deliberately narrower than the full "Coverage"
-- product spec for this first pass. Eligibility requires ALL of:
--   1. orders.authority_status = 'confirmed' — a direct parent/legal
--      guardian completed Adult Permission themselves (migration 0071).
--      NOT 'guardian_approved': that path (coach/organiser/other-adult
--      submits, a separate guardian approves via a one-time emailed link)
--      never establishes an authenticated session for the approving
--      guardian anywhere in this codebase — respond_to_builder_guardian_
--      approval (0071) takes only a token hash, no auth.uid() at all. There
--      is currently no browser session to safely grant sharing control to
--      for that path. Confirmed by reading src/app/builder-approval/
--      [token]/page.tsx directly: no signInWithOtp, no auth.uid() anywhere
--      in that journey. Enabling sharing there would require a new
--      guardian-authentication step on that page first — a materially
--      different, separate piece of work, not something to bolt on here.
--   2. auth.uid() = builder_order_authority_declarations.adult_user_id for
--      this order — the same verified-by-OTP adult who declared authority,
--      not merely someone who knows the order id.
--   3. builder_order_authority_declarations.relationship = 'parent_guardian'
--      and confirmed_photo_permission = true — the existing, real evidence
--      of photo/branding permission this guardian already gave. (Open
--      question, documented in the children's DPIA: this confirmation's
--      exact wording covers the uploaded photograph; it does not name any
--      separately-uploaded club/team crest. Treated as covering both for
--      this initial safe policy, since the same authenticated adult chose
--      every visible asset in one continuous builder session — flagged for
--      specialist review, not asserted as a settled legal position.)
--   4. Exactly one row in `cards` for this order_id. Proves this is a
--      single-child order, so the one declaring adult is unambiguously
--      that one child's guardian. A multi-player ("whole team") order under
--      the ordinary builder has only ONE authority declaration for
--      potentially MANY children — the schema cannot distinguish which
--      child that adult is actually the guardian of, so sharing is hidden
--      entirely for that mode (checked here, server-side, by row count —
--      never trusted from a client-supplied order "type").
--   5. That one card's access_status is null (not suspended, not revoked).
--      A pending/active child-data deletion request already sets
--      access_status='suspended' with reason='deletion_request' as a side
--      effect of filing the request (migration 0076) — so this single
--      check also covers "no pending/active deletion request", with no
--      separate query needed.
--   6. The card's card_definitions row has status='approved' (not a stray
--      draft) and template_id is on the Custom Collection allowlist below.
--      Official Collection and any licensed/third-party design (EMJFL
--      official badge, Hollinwood partner variants) are excluded: no
--      repository evidence was found that Emblem holds social-distribution
--      rights for those assets (this migration's own author searched
--      docs/ and the template-classification source directly and found
--      none) — this is the safe default the product spec itself requires
--      when that evidence is absent, not a claim that such rights do not
--      exist. Recorded as an open rights question in the children's DPIA.
--
-- Coverage deliberately NOT implemented in this pass, and why:
--   - Squad Invite: squad_invite_participations.guardian_profile_id IS a
--      real, session-backed identity (set from auth.getUser() server-side
--      in commit/route.ts, confirmed by direct read) — this table COULD
--      support a parallel eligibility check. It is not wired here because
--      Squad Invite has its own, entirely separate success screen and its
--      own active in-flight workstream this session (payment activation);
--      bolting sharing onto it without dedicated review of its own
--      permissions/rights evidence is out of scope for this pass. Left as
--      a documented follow-up, not silently attempted.
--   - The other-adult/coach/organiser guardian_approved path: see point 1.
--
-- Every RPC here: SECURITY DEFINER, empty search_path, auth.uid() is null
-- fail-closed, row-locked where a write occurs, idempotent where the
-- operation allows it — the same discipline as 0071/0075/0076.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — card_share_consent_events: append-only. Never stores the
-- generated image, a name, an email, a phone number, or any other personal
-- data beyond the profile id already required to prove who consented.
-- artwork_card_definition_id ties the event to the exact, immutable
-- card_definitions row that was on screen at consent time (that table's
-- rows are written once at order-submission time and never updated by any
-- existing code path) — a stable version reference without needing
-- pgcrypto's digest() under search_path='' (this codebase's own established
-- avoidance, per migration 0071's respond_to_builder_guardian_approval
-- comment).
-- ----------------------------------------------------------------------------
create table public.card_share_consent_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  artwork_card_definition_id uuid references public.card_definitions(id) on delete set null,
  guardian_profile_id uuid not null,
  consent_version text not null,
  result text not null check (result in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

comment on table public.card_share_consent_events is
  'Append-only. Never stores the generated share image, a name, an email, a phone number, or private profile data — only the fact that a specific authenticated profile confirmed or cancelled sharing a specific, versioned card design. A cancelled row is never itself permission to share; only a confirmed row, produced by record_card_share_consent after its own fresh eligibility check, represents consent. No UPDATE or DELETE grant exists for any role, including service_role — corrected by inserting a new event, never by mutating history. On player/guardian deletion, this table participates in the same erasure design as builder_authority_audit_events / card_access_audit_events: the event fact may be retained, guardian_profile_id may be nulled or the row removed per the approved retention design, but this migration does not itself alter the deletion runbook — see the children''s DPIA note accompanying this migration.';

create index card_share_consent_events_order_id_idx on public.card_share_consent_events(order_id);
create index card_share_consent_events_card_id_idx on public.card_share_consent_events(card_id);

alter table public.card_share_consent_events enable row level security;
-- No policies — service-role only, same deliberate default-deny pattern as
-- every other audit/consent table in this codebase (0071/0075/0076).
-- Nothing here is ever read directly by an authenticated client.
revoke all on public.card_share_consent_events from public, anon, authenticated, service_role;
grant select, insert on public.card_share_consent_events to service_role;

-- ----------------------------------------------------------------------------
-- Part 2 — get_card_share_eligibility: read-only, callable directly by an
-- authenticated client (same pattern as record_builder_authority_
-- declaration in 0071) — computed fresh on every call, never cached
-- server-side or trusted from an earlier response. reason is a fixed,
-- internal vocabulary for the calling route/UI to map to its own neutral
-- copy — never returned to the client verbatim as user-facing text (the
-- product spec requires a plain, non-diagnostic message; this function's
-- job is only to be truthful and fail closed, not to write UI copy).
-- ----------------------------------------------------------------------------
create or replace function public.get_card_share_eligibility(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_order record;
  v_declaration record;
  v_card_count int;
  v_card record;
  v_definition record;
  v_custom_template_ids text[] := array['custom-solar', 'custom-galaxy', 'custom-comic'];
begin
  if auth.uid() is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authenticated');
  end if;
  if p_order_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  if v_order.authority_status is distinct from 'confirmed' then
    -- Covers guardian_approval_pending, guardian_approved, guardian_declined,
    -- and null (Squad Invite / historical orders) alike — none of them are
    -- the direct-parent-guardian case this pass supports. See this
    -- migration's own header comment for why 'guardian_approved' is
    -- deliberately excluded, not merely unimplemented by oversight.
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select * into v_declaration
  from public.builder_order_authority_declarations
  where order_id = p_order_id;

  if v_declaration.id is null
     or v_declaration.adult_user_id is distinct from auth.uid()
     or v_declaration.relationship is distinct from 'parent_guardian'
     or v_declaration.confirmed_photo_permission is distinct from true then
    return jsonb_build_object('eligible', false, 'reason', 'not_authorized');
  end if;

  select count(*) into v_card_count from public.cards where order_id = p_order_id;
  if v_card_count is distinct from 1 then
    -- Whole-team / multi-player order under the ordinary builder — cannot
    -- prove a separate guardian relationship for every card. Hidden, not
    -- shown as a blocked state, since this is a builder-mode limitation,
    -- not something about this particular guardian or card.
    return jsonb_build_object('eligible', false, 'reason', 'multi_child_order');
  end if;

  select * into v_card from public.cards where order_id = p_order_id;

  if v_card.access_status is not null then
    -- suspended or revoked; a pending/active deletion request already
    -- suspends the card as a side effect of filing the request (0076), so
    -- this single check also covers "deletion pending" — no separate query.
    return jsonb_build_object(
      'eligible', false,
      'reason', case when v_card.access_status = 'revoked' then 'card_revoked' else 'card_suspended' end
    );
  end if;

  select * into v_definition
  from public.card_definitions
  where order_id = p_order_id and player_id = v_card.player_id
  order by created_at desc
  limit 1;

  if v_definition.id is null or v_definition.status is distinct from 'approved' then
    return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
  end if;

  if not (v_definition.template_id = any(v_custom_template_ids)) then
    -- Official Collection / licensed / third-party / any template not on
    -- this explicit allowlist. Allowlisting, not blocklisting, is
    -- deliberate: an unrecognised future template id fails closed by
    -- default rather than being accidentally shareable.
    return jsonb_build_object('eligible', false, 'reason', 'design_not_permitted');
  end if;

  return jsonb_build_object(
    'eligible', true,
    'cardId', v_card.id,
    'artworkCardDefinitionId', v_definition.id
  );
end;
$$;

revoke all on function public.get_card_share_eligibility(uuid) from public, anon;
grant execute on function public.get_card_share_eligibility(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 3 — record_card_share_consent: callable directly by an authenticated
-- client. For p_result='cancelled', records the cancellation without
-- re-deriving eligibility (cancelling is always allowed to be logged,
-- exactly because it never grants anything). For p_result='confirmed', re-
-- runs the full eligibility check itself — never trusts a client-supplied
-- "I checked eligibility already" claim — and raises rather than inserting
-- a confirmed row if anything has changed since the client last checked
-- (e.g. the card was suspended a moment ago). Idempotent in the sense that
-- calling this twice for the same still-eligible order simply records two
-- honest, separate consent events (a guardian sharing again later is a
-- new, real consent event, not a duplicate to be collapsed).
-- ----------------------------------------------------------------------------
create or replace function public.record_card_share_consent(
  p_order_id uuid,
  p_consent_version text,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility jsonb;
  v_card_id uuid;
  v_definition_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;
  if p_consent_version is null or length(trim(p_consent_version)) = 0 then
    raise exception 'consent_version is required';
  end if;
  if p_result is null or p_result not in ('confirmed', 'cancelled') then
    raise exception 'invalid result';
  end if;

  if p_result = 'cancelled' then
    insert into public.card_share_consent_events (order_id, guardian_profile_id, consent_version, result)
    values (p_order_id, auth.uid(), p_consent_version, 'cancelled');
    return jsonb_build_object('ok', true, 'result', 'cancelled');
  end if;

  v_eligibility := public.get_card_share_eligibility(p_order_id);
  if (v_eligibility ->> 'eligible')::boolean is not true then
    raise exception 'Sharing is not available for this card';
  end if;

  v_card_id := (v_eligibility ->> 'cardId')::uuid;
  v_definition_id := (v_eligibility ->> 'artworkCardDefinitionId')::uuid;

  insert into public.card_share_consent_events (
    order_id, card_id, artwork_card_definition_id, guardian_profile_id, consent_version, result
  ) values (
    p_order_id, v_card_id, v_definition_id, auth.uid(), p_consent_version, 'confirmed'
  );

  return jsonb_build_object('ok', true, 'result', 'confirmed');
end;
$$;

revoke all on function public.record_card_share_consent(uuid, text, text) from public, anon;
grant execute on function public.record_card_share_consent(uuid, text, text) to authenticated;

commit;

-- ============================================================================
-- Card lifecycle controls: suspend, revoke, replace — Gate 2 pilot package.
--
-- PRINCIPLE: does not touch cards.status ('unassigned'/'assigned'/'claimed')
-- at all. That axis describes progress toward being claimed — a different
-- concern from "is this card currently authorised to work." Exactly the
-- same reasoning that kept orders.authority_status a separate column from
-- orders.payment_status in migration 0071 — reused here deliberately.
--
-- New, minimal state axis: cards.access_status
--   NULL (default, every existing row)  = active/normal, zero behaviour
--     change for any card until explicitly acted on.
--   'suspended' = temporary, reversible, immediate effect.
--   'revoked'   = terminal. No code path in this migration or the
--     application ever writes over a revoked row's access_status — the
--     same discipline already proven for guardian_declined in migration
--     0071's respond_to_builder_guardian_approval.
--
-- Replacement is modelled as a relationship between two rows, not a status
-- value on one: the OLD card becomes access_status='revoked' with
-- replaced_by_card_id pointing at the NEW card (a fresh row, fresh
-- claim_token, same player_id). Because guardians link to players, not to
-- cards (guardians.player_id, no card_id column — confirmed by reading the
-- schema directly), a replacement card sharing the same player_id is
-- automatically visible to the existing guardians without touching
-- `guardians` at all — no second child identity, no duplicate profile.
--
-- AUTHORIZATION MODEL (resolves the two open founder decisions from the
-- prior discovery pass's own "Stop conditions" section — neither was ever
-- answered by a recorded founder decision, so this migration applies the
-- conservative default this task's own instructions specify):
--   suspend / unsuspend : guardian (own card only) OR staff (any card)
--   revoke               : STAFF ONLY (terminal action)
--   replacement creation  : STAFF ONLY (triggers real physical production,
--                            same recommendation the prior design already
--                            made independently)
-- Coaches get no grant on any of this, by construction — no RPC checks a
-- coach_team relationship at all.
--
-- Every RPC: SECURITY DEFINER, set search_path = '', explicit
-- auth.uid() is null fail-closed check, `select ... for update` row-locking
-- on the target card before acting, idempotent where the operation allows
-- it (suspending an already-suspended card is a safe no-op, not an error).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — cards: new columns, additive only, NULL-default so every
-- existing row is completely unaffected until explicitly acted on.
-- ----------------------------------------------------------------------------
alter table public.cards
  add column access_status text,
  add column access_status_reason text,
  add column access_status_changed_at timestamptz,
  add column replaced_by_card_id uuid references public.cards(id);

alter table public.cards add constraint cards_access_status_valid
  check (access_status is null or access_status in ('suspended', 'revoked'));

alter table public.cards add constraint cards_access_status_reason_valid
  check (access_status_reason is null or access_status_reason in
    ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other'));

comment on column public.cards.access_status is
  'Independent from cards.status (claim progress). NULL = active/normal. suspended = temporary, reversible. revoked = terminal — no code path anywhere may move a row out of this state. Written only by suspend_card/unsuspend_card/revoke_card/create_replacement_card, never directly.';
comment on column public.cards.replaced_by_card_id is
  'Set only on an OLD card by create_replacement_card, alongside access_status=revoked. A "replaced" card is access_status=revoked AND replaced_by_card_id is not null — there is no separate replaced status value.';

-- Column-scoped SELECT for authenticated, additive to migration 0073's
-- existing grant (player_id, card_definition_id, created_at) — needed so a
-- guardian's own session can read their card's current lifecycle state for
-- the status UI. claim_token and nfc_uid remain excluded, exactly as 0073
-- already established; this migration does not touch that grant.
grant select (access_status, access_status_reason, access_status_changed_at, replaced_by_card_id)
  on public.cards to authenticated;

-- ----------------------------------------------------------------------------
-- Part 2 — card_access_audit_events: append-only, same discipline already
-- proven in migration 0071's builder_authority_audit_events, corrected
-- from the start by the lesson migration 0072 had to learn the hard way:
-- this Supabase project's own pg_default_acl grants service_role the FULL
-- privilege set on every new table automatically — explicitly revoke that
-- before granting only what's needed, rather than relying on a bare GRANT
-- statement to be a narrowing (it is not).
-- ----------------------------------------------------------------------------
create table public.card_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.cards(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  event_type text not null check (event_type in (
    'suspended', 'unsuspended', 'revoked', 'replacement_created'
  )),
  actor_role text not null check (actor_role in ('guardian', 'staff')),
  actor_profile_id uuid not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.card_access_audit_events is
  'Append-only. metadata never contains a child''s name, photo, or any other deleted-on-request personal data — only the fact and shape of the lifecycle event, same discipline the child-data deletion runbook already requires of every audit record in this codebase. No UPDATE or DELETE grant exists on this table for any role, including service_role — rows are corrected by inserting a new event, never by mutating history.';

create index card_access_audit_events_card_id_idx on public.card_access_audit_events(card_id);
create index card_access_audit_events_player_id_idx on public.card_access_audit_events(player_id);

alter table public.card_access_audit_events enable row level security;
-- No policies — service-role only, same deliberate default-deny pattern as
-- builder_order_authority_declarations and the 0068/0070 capability tables.
-- Nothing here is ever read directly by an authenticated client.
revoke all on public.card_access_audit_events from public, anon, authenticated, service_role;
grant select, insert on public.card_access_audit_events to service_role;

-- ----------------------------------------------------------------------------
-- Part 3 — suspend_card: guardian (own card) or staff (any card). Idempotent.
-- ----------------------------------------------------------------------------
create function public.suspend_card(
  p_card_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_is_guardian boolean;
  v_is_staff boolean;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Not authorized to update this card';
  end if;

  v_is_staff := exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid());
  v_is_guardian := v_card.player_id is not null and exists (
    select 1 from public.guardians g where g.player_id = v_card.player_id and g.profile_id = auth.uid()
  );

  if not (v_is_staff or v_is_guardian) then
    raise exception 'Not authorized to update this card';
  end if;
  v_actor_role := case when v_is_staff then 'staff' else 'guardian' end;

  if p_reason is not null and p_reason not in ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other') then
    raise exception 'Unsupported reason: %', p_reason;
  end if;

  if v_card.access_status = 'revoked' then
    raise exception 'This card is permanently revoked and cannot be suspended';
  end if;

  if v_card.access_status = 'suspended' then
    -- Idempotent no-op: already suspended.
    return;
  end if;

  update public.cards
  set access_status = 'suspended',
      access_status_reason = p_reason,
      access_status_changed_at = now()
  where id = p_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id, reason)
  values (p_card_id, v_card.player_id, 'suspended', v_actor_role, auth.uid(), p_reason);
end;
$$;

revoke all on function public.suspend_card(uuid, text) from public, anon;
grant execute on function public.suspend_card(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 4 — unsuspend_card: guardian (own card) or staff. Only valid from
-- suspended -> active. Idempotent.
-- ----------------------------------------------------------------------------
create function public.unsuspend_card(
  p_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_is_guardian boolean;
  v_is_staff boolean;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Not authorized to update this card';
  end if;

  v_is_staff := exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid());
  v_is_guardian := v_card.player_id is not null and exists (
    select 1 from public.guardians g where g.player_id = v_card.player_id and g.profile_id = auth.uid()
  );

  if not (v_is_staff or v_is_guardian) then
    raise exception 'Not authorized to update this card';
  end if;
  v_actor_role := case when v_is_staff then 'staff' else 'guardian' end;

  if v_card.access_status = 'revoked' then
    raise exception 'This card is permanently revoked and cannot be unsuspended';
  end if;

  if v_card.access_status is null then
    -- Idempotent no-op: already active.
    return;
  end if;

  update public.cards
  set access_status = null,
      access_status_reason = null,
      access_status_changed_at = now()
  where id = p_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id)
  values (p_card_id, v_card.player_id, 'unsuspended', v_actor_role, auth.uid());
end;
$$;

revoke all on function public.unsuspend_card(uuid) from public, anon;
grant execute on function public.unsuspend_card(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 5 — revoke_card: STAFF ONLY. Terminal. Idempotent (already-revoked
-- is a safe no-op, never an error — a concurrent double-revoke must not
-- crash either caller).
-- ----------------------------------------------------------------------------
create function public.revoke_card(
  p_card_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'Card not found';
  end if;

  if p_reason is not null and p_reason not in ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other') then
    raise exception 'Unsupported reason: %', p_reason;
  end if;

  if v_card.access_status = 'revoked' then
    -- Idempotent no-op: already revoked (possibly via replacement).
    return;
  end if;

  update public.cards
  set access_status = 'revoked',
      access_status_reason = p_reason,
      access_status_changed_at = now()
  where id = p_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id, reason)
  values (p_card_id, v_card.player_id, 'revoked', 'staff', auth.uid(), p_reason);
end;
$$;

revoke all on function public.revoke_card(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_card(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 6 — create_replacement_card: STAFF ONLY. One transaction: lock old
-- card, verify not already revoked, revoke old + link, create new card
-- (fresh claim_token, same player_id, same generator/entropy as
-- create_authoritative_order in 0048 — reused verbatim, not reimplemented),
-- write one audit event. If the old card's status was 'claimed', the new
-- card starts 'claimed' too (the family already proved ownership; this
-- deliberately avoids re-running claimPlayerForCard's own claim logic
-- rather than teaching it a new case) — otherwise the new card starts
-- 'assigned', needing its own first tap.
-- ----------------------------------------------------------------------------
create function public.create_replacement_card(
  p_old_card_id uuid,
  p_reason text
)
returns table(new_card_id uuid, new_claim_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_new_card_id uuid;
  v_claim_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_claim_bytes bytea;
  v_claim_token text;
  v_attempt int;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.staff_accounts sa where sa.profile_id = auth.uid()) then
    raise exception 'Staff access required';
  end if;

  select * into v_old from public.cards where id = p_old_card_id for update;
  if v_old.id is null then
    raise exception 'Card not found';
  end if;

  if v_old.access_status = 'revoked' then
    raise exception 'This card is already revoked and cannot be replaced again';
  end if;

  if p_reason is not null and p_reason not in ('lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other') then
    raise exception 'Unsupported reason: %', p_reason;
  end if;

  v_new_status := case when v_old.status = 'claimed' then 'claimed' else 'assigned' end;

  v_new_card_id := null;
  for v_attempt in 1..5 loop
    v_claim_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_claim_token := '';
    for i in 0..6 loop
      v_claim_token := v_claim_token || substr(v_claim_alphabet, 1 + (get_byte(v_claim_bytes, i) % 32), 1);
    end loop;
    begin
      insert into public.cards (claim_token, player_id, status)
      values (v_claim_token, v_old.player_id, v_new_status)
      returning id into v_new_card_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise exception 'could not generate a unique claim token';
      end if;
    end;
  end loop;

  update public.cards
  set access_status = 'revoked',
      access_status_reason = coalesce(p_reason, 'other'),
      access_status_changed_at = now(),
      replaced_by_card_id = v_new_card_id
  where id = p_old_card_id;

  insert into public.card_access_audit_events (card_id, player_id, event_type, actor_role, actor_profile_id, reason, metadata)
  values (p_old_card_id, v_old.player_id, 'replacement_created', 'staff', auth.uid(), p_reason, jsonb_build_object('new_card_id', v_new_card_id));

  return query select v_new_card_id, v_claim_token;
end;
$$;

revoke all on function public.create_replacement_card(uuid, text) from public, anon, authenticated;
grant execute on function public.create_replacement_card(uuid, text) to authenticated;

commit;

-- Real early closure for Squad Invite campaigns. An organiser previously
-- had no way to stop a campaign before its natural deadline+grace window
-- — flag-concern is purely informational, and the dormant PATCH
-- .../invitation-link endpoint (no UI ever called it) wouldn't have
-- stopped an in-flight commit anyway, since commit_squad_invite_
-- participation_order never reads link status.
--
-- 'closed' (campaign_status) and 'campaign_closed' (event_type) were
-- both already valid enum values with zero code ever setting them —
-- verified directly against the live constraints before writing this,
-- not assumed. Only 'campaign_reopened' is a genuinely new event_type.
alter table public.squad_invite_audit_events
  drop constraint squad_invite_audit_events_event_type_check,
  add constraint squad_invite_audit_events_event_type_check
    check (event_type = any (array[
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested',
      'coach_card_submitted','coach_card_locked','coach_card_changes_requested',
      'photo_rejected',
      'campaign_reopened'
    ]));

-- Organiser-only, self-checked inside the function (not just trusted from
-- the calling route) given the weight of the action — deliberately not
-- following replace_squad_invite_link's lighter "route already checked
-- ownership" precedent here. campaign_status='closed' alone is what makes
-- commit_squad_invite_participation_order start rejecting new commits —
-- that function needs no separate awareness of *why* a campaign isn't
-- 'active', only that it isn't (see the exception-splitting change to it
-- below, which only adds a distinct message, never changes what's blocked).
create or replace function public.close_squad_invite_campaign(p_campaign_id uuid, p_actor_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_campaign public.squad_invites%rowtype;
begin
  select * into v_campaign from public.squad_invites where id = p_campaign_id for update;
  if not found or v_campaign.organiser_profile_id <> p_actor_profile_id then
    raise exception 'campaign unavailable';
  end if;
  if v_campaign.campaign_status <> 'active' then
    raise exception 'campaign is not open to close';
  end if;
  update public.squad_invites set campaign_status = 'closed', updated_at = now() where id = p_campaign_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type)
    values (p_campaign_id, p_actor_profile_id, 'organiser', 'campaign_closed');
  return jsonb_build_object('ok', true, 'campaignStatus', 'closed');
end;
$$;
alter function public.close_squad_invite_campaign(uuid, uuid) owner to postgres;
revoke all on function public.close_squad_invite_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_squad_invite_campaign(uuid, uuid) to service_role;

-- The reverse of close — reversible by design (Blake: "a coach who closes
-- at nine players and then remembers a tenth needs a way back"). Closing
-- only ever touches campaign_status and writes an audit event, nothing
-- else (no link revocation, no other side effects), so reopening is
-- exactly the mirror image. The one real guard: once pricing has been
-- finalised the price is locked and irreversible (finalise_squad_invite_
-- pricing is itself idempotent and never recomputes) — a closed-then-
-- finalised campaign must never reopen. No time-based guard beyond that
-- is needed: if grace_ends_at has already passed, commit_squad_invite_
-- participation_order's own separate now() >= grace_ends_at check still
-- blocks new commits regardless of campaign_status, so reopening past
-- that point is a harmless no-op rather than something to special-case.
create or replace function public.reopen_squad_invite_campaign(p_campaign_id uuid, p_actor_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_campaign public.squad_invites%rowtype;
begin
  select * into v_campaign from public.squad_invites where id = p_campaign_id for update;
  if not found or v_campaign.organiser_profile_id <> p_actor_profile_id then
    raise exception 'campaign unavailable';
  end if;
  if v_campaign.campaign_status <> 'closed' then
    raise exception 'campaign is not closed';
  end if;
  -- Currently unreachable in practice: finalise_squad_invite_pricing always
  -- moves campaign_status from 'closed' to 'pricing_finalised' on success,
  -- so the campaign_status <> 'closed' check above always fires first once
  -- pricing has been finalised — this branch never runs. Kept anyway as a
  -- defensive guard in case that coupling ever changes (e.g. a future path
  -- that finalises pricing without also leaving 'closed'), so reopening a
  -- priced campaign stays refused on its own terms, not only as a side
  -- effect of the status check above.
  if v_campaign.pricing_finalised_at is not null then
    raise exception 'campaign pricing has already been finalised';
  end if;
  update public.squad_invites set campaign_status = 'active', updated_at = now() where id = p_campaign_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type)
    values (p_campaign_id, p_actor_profile_id, 'organiser', 'campaign_reopened');
  return jsonb_build_object('ok', true, 'campaignStatus', 'active');
end;
$$;
alter function public.reopen_squad_invite_campaign(uuid, uuid) owner to postgres;
revoke all on function public.reopen_squad_invite_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reopen_squad_invite_campaign(uuid, uuid) to service_role;

-- Lets staff finalise a closed campaign immediately, without waiting for
-- the natural grace period — the organiser already closed it, there is
-- nothing left to wait for. Every other branch of this function
-- (idempotent-repeat check, cancelled/expired guard, eligible-commitment
-- count, tier computation, the update/audit-event at the end) is
-- byte-for-byte unchanged — only the grace-period wait itself is bypassed,
-- and only for a closed campaign.
create or replace function public.finalise_squad_invite_pricing(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.squad_invites%rowtype;
  v_count integer;
  v_prints integer;
  v_tier text;
  v_unit integer;
begin
  select * into v_campaign from public.squad_invites where id = p_campaign_id for update;
  if not found then raise exception 'campaign not found'; end if;
  if v_campaign.pricing_finalised_at is not null then
    return jsonb_build_object('created', false, 'tier', v_campaign.final_tier, 'unitPricePence', v_campaign.final_unit_price_pence);
  end if;
  if v_campaign.campaign_status <> 'closed' and now() < v_campaign.grace_ends_at then
    raise exception 'completion grace period has not ended';
  end if;
  if v_campaign.campaign_status in ('cancelled','expired') then raise exception 'campaign cannot be priced'; end if;
  select count(*), coalesce(sum(print_quantity), 0) into v_count, v_prints
  from public.squad_invite_participations
  where campaign_id = p_campaign_id and status = 'commitment_completed';
  if v_count < 1 or v_prints < v_count then raise exception 'campaign has no eligible commitments'; end if;
  if v_count >= 10 then v_tier := 'squad'; v_unit := 1899;
  elsif v_count >= 2 then v_tier := 'multi'; v_unit := 2199;
  else v_tier := 'single'; v_unit := 2499;
  end if;
  update public.squad_invites set
    campaign_status = 'pricing_finalised', payment_phase = 'requests_pending',
    pricing_finalised_at = now(), pricing_policy = 'squad_invite_commitment_pricing_v1',
    pricing_version = 1, final_tier = v_tier, final_unit_price_pence = v_unit,
    final_commitment_count = v_count, closed_at = now(), updated_at = now()
  where id = p_campaign_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_role, event_type, metadata)
  values (p_campaign_id, 'system', 'pricing_finalised', jsonb_build_object('commitmentCount', v_count, 'printQuantity', v_prints, 'tier', v_tier));
  return jsonb_build_object('created', true, 'commitmentCount', v_count, 'printQuantity', v_prints, 'tier', v_tier, 'unitPricePence', v_unit);
end;
$$;

alter function public.finalise_squad_invite_pricing(uuid) owner to postgres;
revoke all on function public.finalise_squad_invite_pricing(uuid) from public, anon, authenticated;
grant execute on function public.finalise_squad_invite_pricing(uuid) to service_role;

-- Splits the single generic 'campaign not eligible' exception so a closed
-- campaign gets its own distinct message — "retry shortly" (the existing
-- generic client-side copy for this whole error class) is actively wrong
-- once an organiser has closed the campaign; retrying can never help.
-- Every other rejection reason in this function (participation not found/
-- mismatched, already-committed idempotent-return, wrong status, not
-- 'started', grace elapsed, any campaign_status other than closed that
-- still isn't in the allowed list, every validation check, claim-token
-- generation, all the inserts) is byte-for-byte unchanged below — only
-- the eligibility check gained one new branch ahead of the existing one.
create or replace function public.commit_squad_invite_participation_order(
  p_participation_id uuid,
  p_guardian_profile_id uuid,
  p_builder_token_hash text,
  p_guardian_email text,
  p_template_id text,
  p_display_first_name text,
  p_display_surname_initial text,
  p_squad_number integer,
  p_position text,
  p_print_quantity integer,
  p_photo jsonb,
  p_stats jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_campaign public.squad_invites%rowtype;
  v_order_id uuid;
  v_player_id uuid;
  v_card_id uuid;
  v_definition_id uuid;
  v_existing_card_id uuid;
  v_claim_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_claim_bytes bytea;
  v_claim_token text;
  v_attempt int;
  i int;
  v_order_ref text;
  v_display_name text;
  v_description text;
begin
  select * into v_participation from public.squad_invite_participations where id = p_participation_id for update;
  if not found then raise exception 'participation unavailable'; end if;

  if v_participation.guardian_profile_id is distinct from p_guardian_profile_id
     or v_participation.builder_token_hash is distinct from p_builder_token_hash then
    raise exception 'participation unavailable';
  end if;

  -- Idempotent retry: never re-insert once an order already exists for this
  -- participation (a lost response, a client double-submit that slipped
  -- past the UI guard, or the concurrent-caller case described above).
  if v_participation.order_id is not null then
    select id into v_existing_card_id from public.cards where order_id = v_participation.order_id limit 1;
    return jsonb_build_object('created', false, 'orderId', v_participation.order_id, 'cardId', v_existing_card_id, 'participationId', v_participation.id);
  end if;

  if v_participation.status <> 'started' then raise exception 'commitment unavailable'; end if;

  -- Eligibility mirrors src/lib/squad-invite.ts's effectiveCampaignStatus()/
  -- mayCompleteExistingBuilder() exactly (active or grace_period, i.e. the
  -- stored status is one of the three deadline-bearing states AND we are
  -- still before grace_ends_at, the trigger-maintained deadline+24h column)
  -- — the same rule the existing commit endpoint already enforces, just
  -- re-checked authoritatively inside this transaction instead of trusted
  -- from the caller. The closed-campaign check is separated out (0066)
  -- purely so the caller can distinguish it and give the parent an
  -- accurate message instead of the generic "try again shortly" — it
  -- changes nothing about what's actually blocked, 'closed' was already
  -- outside the allow-list below before this migration.
  select * into v_campaign from public.squad_invites where id = v_participation.campaign_id for update;
  if not found then raise exception 'campaign not eligible'; end if;
  if v_campaign.campaign_status = 'closed' then raise exception 'campaign closed by organiser'; end if;
  if v_campaign.campaign_status not in ('active', 'deadline_reached', 'grace_period')
     or now() >= v_campaign.grace_ends_at then
    raise exception 'campaign not eligible';
  end if;

  if coalesce(length(trim(p_display_first_name)), 0) = 0 then raise exception 'invalid submission'; end if;
  if p_display_surname_initial !~ '^[A-Z]$' then raise exception 'invalid submission'; end if;
  if p_print_quantity is null or p_print_quantity < 1 or p_print_quantity > 100 then raise exception 'invalid submission'; end if;
  if coalesce(length(trim(p_template_id)), 0) = 0 then raise exception 'invalid submission'; end if;
  if p_photo is null or coalesce(length(trim(p_photo->>'storageKey')), 0) = 0 then raise exception 'invalid submission'; end if;

  v_order_ref := 'squad-' || replace(p_participation_id::text, '-', '') || '-' || replace(gen_random_uuid()::text, '-', '');
  -- Minimal, privacy-preserving representation — first name plus surname
  -- initial only, matching every other Squad Invite surface this session;
  -- no full surname is ever written into players.name.
  v_display_name := trim(p_display_first_name) || ' ' || p_display_surname_initial || '.';

  -- payment_status starts at 'order_intent' — the exact same default every
  -- normal order gets from create_authoritative_order (0049) — never
  -- 'paid' or 'fulfilled'. All per-order pricing-snapshot columns are left
  -- null: Squad Invite pricing is campaign-level and set later by staff via
  -- finalise_squad_invite_pricing (0050), never per order, so there
  -- genuinely is no price to record here yet — satisfies
  -- orders_pricing_snapshot_coherent's null-together branch.
  insert into public.orders (order_ref, purchaser_email, source, payment_status, club_name, team_name)
  values (v_order_ref, p_guardian_email, 'squad_invite', 'order_intent', v_campaign.club_team_name, v_campaign.club_team_name)
  returning id into v_order_id;

  insert into public.players (name, "position", squad_number)
  values (v_display_name, nullif(trim(coalesce(p_position, '')), ''), p_squad_number)
  returning id into v_player_id;

  -- Same claim_token generation as create_authoritative_order (0049) —
  -- kept byte-for-byte identical so claim_token format/entropy stays one
  -- convention across every order-creating path in this codebase.
  v_card_id := null;
  for v_attempt in 1..5 loop
    v_claim_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_claim_token := '';
    for i in 0..6 loop
      v_claim_token := v_claim_token || substr(v_claim_alphabet, 1 + (get_byte(v_claim_bytes, i) % 32), 1);
    end loop;
    begin
      insert into public.cards (claim_token, player_id, order_id, status)
      values (v_claim_token, v_player_id, v_order_id, 'assigned')
      returning id into v_card_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise exception 'could not generate a unique claim token'; end if;
    end;
  end loop;

  -- template_id is always supplied in Squad Invite mode (ProductionBuilder
  -- requires a template selection before the review step is reachable), so
  -- unlike create_authoritative_order's conditional insert (only fires when
  -- both club and templateId are present), this one is unconditional — club
  -- is always the campaign's own club_team_name. logo stays null: the
  -- locked Squad Invite builder mode never exposes a badge-upload control
  -- (that control only renders for the official-collection path, which
  -- Squad Invite mode never uses), matching this codebase's own existing
  -- "no badge uploaded -> plain null" convention.
  insert into public.card_definitions (status, template_id, name, number, team, "position", logo, photo, stats, order_id, player_id)
  values (
    'approved', p_template_id, v_display_name, nullif(p_squad_number::text, ''), v_campaign.club_team_name,
    nullif(trim(coalesce(p_position, '')), ''), null, p_photo, coalesce(p_stats, '{}'::jsonb), v_order_id, v_player_id
  )
  returning id into v_definition_id;

  update public.cards set card_definition_id = v_definition_id where id = v_card_id;

  insert into public.moments (player_id, title, occurred_on, trust, verification_status, card_definition_id, source)
  values (v_player_id, 'Card Created', current_date, 'club', 'system_generated', v_definition_id, 'system')
  on conflict do nothing;

  -- Zero-price line item — the same shape this table's own comment already
  -- documents for a free coach card (0045_order_pricing_schema.sql:157-159);
  -- unit_price_pence/subtotal_pence = 0 is an explicitly allowed, honest
  -- representation of "not charged", not a placeholder.
  v_description := p_print_quantity || ' player card print' || case when p_print_quantity = 1 then '' else 's' end
    || ' - Squad Invite controlled pilot, payment disabled';
  insert into public.order_line_items (order_id, kind, description, quantity, unit_price_pence, subtotal_pence, currency)
  values (v_order_id, 'player_card', v_description, p_print_quantity, 0, 0, 'GBP');

  update public.squad_invite_participations set
    status = 'commitment_completed',
    commitment_completed_at = now(),
    order_id = v_order_id,
    display_first_name = p_display_first_name,
    display_surname_initial = p_display_surname_initial,
    squad_number = p_squad_number,
    print_quantity = p_print_quantity,
    updated_at = now()
  where id = v_participation.id;

  -- Campaign aggregate progress needs no separate write: the dashboard
  -- (squad-invites/[id]/dashboard/route.ts) already live-counts
  -- participations by status rather than maintaining a running total, so
  -- the status update above is itself the aggregate update, inside the
  -- same transaction as everything else.
  insert into public.squad_invite_permissions (campaign_id, participation_id, purpose, policy_version, granted)
  values
    (v_participation.campaign_id, v_participation.id, 'child_information_authority', 'squad_invite_child_authority_v1', true),
    (v_participation.campaign_id, v_participation.id, 'photograph_manufacture', 'squad_invite_photo_manufacture_v1', true),
    (v_participation.campaign_id, v_participation.id, 'consolidated_delivery', 'squad_invite_team_delivery_v1', true),
    (v_participation.campaign_id, v_participation.id, 'payment_neutral_commitment', 'squad_invite_commitment_v1', true);

  insert into public.squad_invite_audit_events (campaign_id, participation_id, actor_role, event_type)
  values (v_participation.campaign_id, v_participation.id, 'parent', 'commitment_completed');

  return jsonb_build_object('created', true, 'orderId', v_order_id, 'cardId', v_card_id, 'participationId', v_participation.id);
end;
$$;

alter function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) owner to postgres;
revoke all on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) to service_role;

comment on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) is
  'Atomically creates the order/player/card/card_definition rows for one Squad Invite commitment and links squad_invite_participations.order_id. Every order starts at payment_status=order_intent — never paid or fulfilled. Idempotent per participation_id via row lock, not a submission key. Closed campaigns get a distinct exception message (0066) so the caller can tell the parent accurately.';

-- Flips the Squad Invite payment wall from false to true — for real this
-- time. This is the exact same switch 0058 flipped once before, reverted
-- by 0064 after it broke every order approval on both environments:
-- nothing had ever marked a Squad Invite order 'paid', so
-- /api/orders/[id]/approve's gate (`if paymentModeEnabled && payment_status
-- <> 'paid' then reject`) rejected all of them. 0064's own comment said
-- re-flipping "requires another reviewed migration, never a runtime env
-- var or client-supplied value" — this is that migration.
--
-- Unlike 0058, the missing plumbing is now actually in place and verified
-- working in production: the Shopify webhook signing secret and the three
-- Squad Invite Shopify variant IDs are both confirmed set (direct Vercel
-- checks), and issue_squad_invite_payment_request (0057) /
-- mark_squad_invite_participation_paid (0059) already exist and are
-- already wired into finalise-pricing and the orders-paid webhook
-- respectively. No new payment mechanics are added by this migration —
-- only the boundary flips, and the consent that assumed it never would.
create or replace function public.squad_invite_payment_mode_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$ select true; $$;

alter function public.squad_invite_payment_mode_enabled() owner to postgres;
revoke all on function public.squad_invite_payment_mode_enabled() from public, anon, authenticated;
grant execute on function public.squad_invite_payment_mode_enabled() to service_role;

comment on function public.squad_invite_payment_mode_enabled() is
  'Server-only policy boundary for Squad Invite payment mode. Flipped to true by this migration (0067) after the payment plumbing (Shopify webhook signing secret, Squad Invite Shopify variant IDs) was verified working in production and every parent-facing "no payment is taken" claim was retired to squad_invite_commitment_v2 (see commit_squad_invite_participation_order below). Reverting requires another reviewed migration, never a runtime env var or client-supplied value.';

-- Bumps the payment_neutral_commitment consent to squad_invite_commitment_v2
-- now that payment is genuinely required — reproduced byte-for-byte from
-- 0066 (the current live version) except for exactly two literal changes:
-- this permission row's policy_version, and the order-line-item
-- description text, which said "payment disabled" and is now false.
-- Every other line — eligibility checks, idempotency, the closed-campaign
-- message, validation, claim-token generation, the other three permission
-- rows, the audit event — is unchanged.
--
-- The purpose string itself stays 'payment_neutral_commitment' —
-- renaming it would touch squad_invite_permissions' CHECK constraint and
-- every historical row's semantics for no reason. That table's own
-- `unique nulls not distinct (campaign_id, participation_id, purpose,
-- policy_version)` constraint (0050) was built specifically so the same
-- purpose could be re-recorded under a new policy_version once the terms
-- genuinely changed — this is the first time that capability is actually
-- exercised anywhere in this codebase.
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

  -- Zero-price line item at commit time — the actual price isn't known
  -- until the campaign's pricing is finalised (finalise_squad_invite_pricing,
  -- 0050), never per order; unit_price_pence/subtotal_pence = 0 here is
  -- an honest "not priced yet", not a "never charged" claim (0067: this
  -- description previously said "payment disabled", which stopped being
  -- true once squad_invite_payment_mode_enabled() was flipped to true
  -- above).
  v_description := p_print_quantity || ' player card print' || case when p_print_quantity = 1 then '' else 's' end
    || ' - Squad Invite order, price and payment confirmed after the invitation window closes';
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
    (v_participation.campaign_id, v_participation.id, 'payment_neutral_commitment', 'squad_invite_commitment_v2', true);

  insert into public.squad_invite_audit_events (campaign_id, participation_id, actor_role, event_type)
  values (v_participation.campaign_id, v_participation.id, 'parent', 'commitment_completed');

  return jsonb_build_object('created', true, 'orderId', v_order_id, 'cardId', v_card_id, 'participationId', v_participation.id);
end;
$$;

alter function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) owner to postgres;
revoke all on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) to service_role;

comment on function public.commit_squad_invite_participation_order(uuid,uuid,text,text,text,text,text,integer,text,integer,jsonb,jsonb) is
  'Atomically creates the order/player/card/card_definition rows for one Squad Invite commitment and links squad_invite_participations.order_id. Every order starts at payment_status=order_intent — never paid or fulfilled. Idempotent per participation_id via row lock, not a submission key. Closed campaigns get a distinct exception message (0066). Payment consent bumped to squad_invite_commitment_v2 (0067) now that squad_invite_payment_mode_enabled() is genuinely true.';

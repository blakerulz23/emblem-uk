-- Squad Invite controlled-pilot foundation. Additive only: existing orders,
-- pricing and public-profile behaviour are unchanged. Payment integration is
-- intentionally absent until Shopify capability is verified.

create table public.squad_invites (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  organiser_profile_id uuid not null references public.profiles(id) on delete restrict,
  organiser_role text not null check (organiser_role in ('coach_or_club_representative','team_manager','parent_representative','emblem_staff')),
  club_team_name text not null check (char_length(trim(club_team_name)) between 2 and 120),
  football_age_group text not null check (char_length(trim(football_age_group)) between 2 and 30),
  badge_reference jsonb,
  expected_squad_size integer check (expected_squad_size between 1 and 100),
  purpose text not null default 'controlled_pilot_team_card_order',
  authority_declaration_version text not null,
  terms_version text not null,
  privacy_version text not null,
  campaign_status text not null default 'draft' check (campaign_status in (
    'draft','awaiting_staff_approval','active','deadline_reached','grace_period',
    'pricing_finalised','expired','cancelled','exception'
  )),
  payment_phase text not null default 'not_started' check (payment_phase in (
    'not_started','requests_pending','window_open','reconciliation','complete','exception'
  )),
  fulfilment_status text not null default 'not_started' check (fulfilment_status in (
    'not_started','ready_for_production','in_production','packed','dispatched',
    'delivered','distribution_confirmed','completed','exception','cancelled'
  )),
  deadline_at timestamptz not null,
  grace_ends_at timestamptz generated always as (deadline_at + interval '24 hours') stored,
  published_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  pricing_finalised_at timestamptz,
  pricing_policy text,
  pricing_version integer,
  final_tier text check (final_tier in ('single','multi','squad')),
  final_unit_price_pence integer check (final_unit_price_pence in (2499,2199,1899)),
  final_commitment_count integer check (final_commitment_count > 0),
  coach_card_eligible boolean not null default false,
  coach_card_confirmed_at timestamptz,
  delivery_recipient_name text not null check (char_length(trim(delivery_recipient_name)) between 2 and 120),
  delivery_recipient_role text not null check (char_length(trim(delivery_recipient_role)) between 2 and 80),
  delivery_address text not null check (char_length(trim(delivery_address)) between 5 and 500),
  delivery_postcode text not null check (char_length(trim(delivery_postcode)) between 5 and 10),
  delivery_contact text not null check (char_length(trim(delivery_contact)) between 3 and 160),
  delivery_instructions text check (char_length(delivery_instructions) <= 300),
  recipient_distribution_accepted_at timestamptz not null,
  approved_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint squad_invites_deadline_future check (deadline_at > created_at),
  constraint squad_invites_approval_coherent check ((approved_at is null) = (approved_by_staff_profile_id is null)),
  constraint squad_invites_frozen_pricing_coherent check (
    (pricing_finalised_at is null and pricing_policy is null and pricing_version is null and final_tier is null and final_unit_price_pence is null and final_commitment_count is null)
    or
    (pricing_finalised_at is not null and pricing_policy = 'squad_invite_commitment_pricing_v1' and pricing_version = 1 and final_tier is not null and final_unit_price_pence is not null and final_commitment_count is not null)
  ),
  constraint squad_invites_frozen_tier_matches_count check (
    final_commitment_count is null
    or (final_commitment_count = 1 and final_tier = 'single' and final_unit_price_pence = 2499)
    or (final_commitment_count between 2 and 9 and final_tier = 'multi' and final_unit_price_pence = 2199)
    or (final_commitment_count >= 10 and final_tier = 'squad' and final_unit_price_pence = 1899)
  )
);

create index squad_invites_organiser_idx on public.squad_invites(organiser_profile_id, created_at desc);
create index squad_invites_public_active_idx on public.squad_invites(public_id) where campaign_status in ('active','deadline_reached','grace_period');

create table public.squad_invite_participations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.squad_invites(id) on delete cascade,
  guardian_profile_id uuid references public.profiles(id) on delete restrict,
  builder_token_hash text not null unique check (char_length(builder_token_hash) = 64),
  order_id uuid unique references public.orders(id) on delete restrict,
  status text not null default 'started' check (status in (
    'started','commitment_completed','payment_request_pending','payment_requested',
    'payment_expired','paid','cancelled','refunded','reversed','production_accepted','exception'
  )),
  display_first_name text,
  display_surname_initial text check (display_surname_initial ~ '^[A-Z]$'),
  squad_number integer check (squad_number between 0 and 999),
  print_quantity integer not null default 1 check (print_quantity between 1 and 100),
  commitment_completed_at timestamptz,
  payment_request_issued_at timestamptz,
  payment_deadline_at timestamptz,
  payment_request_status text not null default 'not_issued' check (payment_request_status in ('not_issued','pending','issued','paid','expired','cancelled','exception')),
  payment_completed_at timestamptz,
  payment_expired_at timestamptz,
  reconciliation_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint squad_invite_payment_window_coherent check (
    payment_request_issued_at is null
    or payment_deadline_at = payment_request_issued_at + interval '72 hours'
  ),
  constraint squad_invite_commitment_coherent check (
    commitment_completed_at is null or status <> 'started'
  )
);

create index squad_invite_participations_campaign_status_idx on public.squad_invite_participations(campaign_id, status);
create index squad_invite_participations_guardian_idx on public.squad_invite_participations(guardian_profile_id) where guardian_profile_id is not null;

create table public.squad_invite_permissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.squad_invites(id) on delete cascade,
  participation_id uuid references public.squad_invite_participations(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('organiser_authority','child_information_authority','photograph_manufacture','consolidated_delivery','payment_neutral_commitment','private_registration')),
  policy_version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  unique nulls not distinct (campaign_id, participation_id, purpose, policy_version)
);

create table public.squad_invite_coach_cards (
  campaign_id uuid primary key references public.squad_invites(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role_title text not null check (char_length(trim(role_title)) between 2 and 80),
  photo_key text not null,
  design jsonb not null,
  configuration_status text not null default 'draft' check (configuration_status in ('draft','submitted','locked','exception')),
  production_eligible boolean not null default false,
  configured_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (campaign_id, production_eligible)
);

create table public.squad_invite_audit_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.squad_invites(id) on delete restrict,
  participation_id uuid references public.squad_invite_participations(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_role text not null check (actor_role in ('public','parent','organiser','staff','system')),
  event_type text not null check (event_type in (
    'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
    'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
    'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
    'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index squad_invite_audit_campaign_idx on public.squad_invite_audit_events(campaign_id, created_at desc);

create table public.campaign_fulfilment_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.squad_invites(id) on delete restrict,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','ready_for_review','ready_for_production','in_production','packed','dispatched','delivered','distribution_confirmed','exception','cancelled')),
  pricing_policy text not null check (pricing_policy = 'squad_invite_commitment_pricing_v1'),
  pricing_version integer not null check (pricing_version = 1),
  final_tier text not null check (final_tier in ('single','multi','squad')),
  final_unit_price_pence integer not null check (final_unit_price_pence in (2499,2199,1899)),
  coach_card_included boolean not null default false,
  created_by_staff_profile_id uuid not null references public.staff_accounts(profile_id) on delete restrict,
  dispatch_at timestamptz,
  courier_tracking_reference text,
  delivered_at timestamptz,
  distribution_confirmed_at timestamptz,
  organiser_access_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaign_fulfilment_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.campaign_fulfilment_batches(id) on delete restrict,
  participation_id uuid not null unique references public.squad_invite_participations(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  card_id uuid unique references public.cards(id) on delete restrict,
  package_reference text not null unique,
  package_label text not null check (char_length(package_label) <= 100),
  included_at timestamptz not null default now(),
  package_status text not null default 'pending' check (package_status in ('pending','approved','manufactured','sealed','included','missing','incorrect_distribution','exception')),
  constraint fulfilment_package_label_no_email check (package_label !~ '@')
);
create index campaign_fulfilment_items_batch_idx on public.campaign_fulfilment_items(batch_id, package_status);

alter table public.squad_invites enable row level security;
alter table public.squad_invite_participations enable row level security;
alter table public.squad_invite_permissions enable row level security;
alter table public.squad_invite_coach_cards enable row level security;
alter table public.squad_invite_audit_events enable row level security;
alter table public.campaign_fulfilment_batches enable row level security;
alter table public.campaign_fulfilment_items enable row level security;

-- Routes use authenticated identity checks plus narrow service-role operations.
-- No table is directly reachable by public/anon/authenticated roles.
revoke all on public.squad_invites, public.squad_invite_participations,
  public.squad_invite_permissions, public.squad_invite_coach_cards,
  public.squad_invite_audit_events, public.campaign_fulfilment_batches,
  public.campaign_fulfilment_items from public, anon, authenticated;

grant select, insert, update on public.squad_invites, public.squad_invite_participations,
  public.squad_invite_permissions, public.squad_invite_coach_cards,
  public.squad_invite_audit_events, public.campaign_fulfilment_batches,
  public.campaign_fulfilment_items to service_role;
grant usage, select on sequence public.squad_invite_audit_events_id_seq to service_role;

comment on table public.squad_invite_permissions is
  'Versioned, purpose-separated acknowledgements. Wording and lawful basis remain subject to specialist review.';
comment on column public.squad_invites.pricing_policy is
  'Controlled-pilot commitment policy; general order pricing remains based on distinct paid players.';
comment on column public.squad_invites.delivery_address is
  'Adult consolidated-fulfilment data; never child-profile or public campaign data.';
comment on table public.campaign_fulfilment_items is
  'Staff fulfilment reconciliation. Minimal organiser manifest must exclude claim secrets, contact, consent and private profile data.';

-- Freeze commitment-based campaign pricing once, after the completion grace.
-- Client counts/prices are never accepted. The general order-pricing RPC is
-- untouched: this is an explicit controlled-pilot policy boundary.
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
  if now() < v_campaign.grace_ends_at then raise exception 'completion grace period has not ended'; end if;
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

-- Recomputes coach-card eligibility from distinct currently-paid orders.
-- Refund/cancel/reverse transitions remove qualification on the next call;
-- fulfilment code must call this before locking a coach card into a batch.
create or replace function public.reconcile_squad_invite_coach_eligibility(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_paid integer; v_eligible boolean;
begin
  perform 1 from public.squad_invites where id = p_campaign_id for update;
  if not found then raise exception 'campaign not found'; end if;
  select count(distinct order_id) into v_paid
  from public.squad_invite_participations
  where campaign_id = p_campaign_id and status = 'paid' and order_id is not null;
  v_eligible := v_paid >= 10;
  update public.squad_invites set coach_card_eligible = v_eligible,
    coach_card_confirmed_at = case when v_eligible then coalesce(coach_card_confirmed_at, now()) else null end,
    updated_at = now() where id = p_campaign_id;
  update public.squad_invite_coach_cards set production_eligible = v_eligible where campaign_id = p_campaign_id;
  return v_eligible;
end;
$$;
alter function public.reconcile_squad_invite_coach_eligibility(uuid) owner to postgres;
revoke all on function public.reconcile_squad_invite_coach_eligibility(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_squad_invite_coach_eligibility(uuid) to service_role;

-- Forward correction: disable application routes and close active campaigns.
-- Before any real use, these additive objects may be dropped in reverse order.
-- After real use, preserve commercial/audit evidence and correct forward.

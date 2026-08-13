-- Reusable Squad Invite credentials are separate from permanent campaign IDs
-- and private participations. Only SHA-256 token hashes are stored.

create table public.squad_invite_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.squad_invites(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active','paused','revoked')),
  expires_at timestamptz not null,
  participation_limit integer check (participation_limit between 1 and 100),
  use_count bigint not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  revoked_at timestamptz,
  replaced_by_link_id uuid references public.squad_invite_links(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint squad_invite_link_expiry_after_creation check (expires_at > created_at),
  constraint squad_invite_link_revocation_coherent check (
    (status = 'revoked' and revoked_at is not null) or (status <> 'revoked' and revoked_at is null)
  )
);
create unique index squad_invite_one_active_link_idx on public.squad_invite_links(campaign_id) where status = 'active';
create index squad_invite_link_campaign_idx on public.squad_invite_links(campaign_id, created_at desc);

create table public.squad_invite_link_audit_events (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.squad_invite_links(id) on delete restrict,
  campaign_id uuid not null references public.squad_invites(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('created','resolved','paused','resumed','revoked','replaced','participation_started','limit_reached')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index squad_invite_link_audit_idx on public.squad_invite_link_audit_events(link_id, created_at desc);

create table public.squad_invite_rate_limits (
  bucket_hash text not null check (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  primary key (bucket_hash, window_started_at)
);

-- One authenticated guardian has at most one private participation in a
-- campaign. Repeated link opens and link rotation cannot duplicate it.
create unique index squad_invite_one_guardian_participation_idx
  on public.squad_invite_participations(campaign_id, guardian_profile_id)
  where guardian_profile_id is not null;

alter table public.squad_invite_links enable row level security;
alter table public.squad_invite_link_audit_events enable row level security;
alter table public.squad_invite_rate_limits enable row level security;
revoke all on public.squad_invite_links, public.squad_invite_link_audit_events, public.squad_invite_rate_limits from public, anon, authenticated;
grant select, insert, update on public.squad_invite_links, public.squad_invite_link_audit_events, public.squad_invite_rate_limits to service_role;
grant usage, select on sequence public.squad_invite_link_audit_events_id_seq to service_role;

create or replace function public.resolve_squad_invite_link(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_link public.squad_invite_links%rowtype; v_campaign public.squad_invites%rowtype; v_count integer; v_tier text;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into v_link from public.squad_invite_links where token_hash = p_token_hash for update;
  if not found or v_link.status <> 'active' or v_link.expires_at <= now() then return null; end if;
  select * into v_campaign from public.squad_invites where id = v_link.campaign_id;
  if not found or v_campaign.campaign_status <> 'active' or v_campaign.deadline_at <= now() then return null; end if;
  select count(*) into v_count from public.squad_invite_participations
    where campaign_id = v_campaign.id and status in ('commitment_completed','payment_request_pending','payment_requested','paid','production_accepted');
  v_tier := case when v_count >= 10 then 'squad' when v_count >= 2 then 'multi' else 'single' end;
  update public.squad_invite_links set use_count = use_count + 1, last_used_at = now() where id = v_link.id;
  insert into public.squad_invite_link_audit_events(link_id,campaign_id,event_type)
    values(v_link.id,v_campaign.id,'resolved');
  return jsonb_build_object(
    'teamName', v_campaign.club_team_name,
    'ageGroup', v_campaign.football_age_group,
    'deadlineAt', v_campaign.deadline_at,
    'completedCommitments', v_count,
    'currentIncentive', v_tier,
    'squadPriceUnlocked', v_count >= 10,
    'freeCoachCardConfirmed', v_campaign.coach_card_eligible,
    'deliverySummary', 'Cards are delivered together to the authorised team organiser for distribution.',
    'badgeReference', case
      when v_campaign.badge_reference->>'source' = 'official'
        then jsonb_build_object('publicPath', v_campaign.badge_reference->>'publicPath')
      else null
    end,
    'productSummary', 'A personalised NFC-connected sporting card. Each parent submits privately and pays individually.'
  );
end;
$$;

create or replace function public.start_squad_invite_participation(
  p_token_hash text, p_guardian_profile_id uuid, p_builder_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_link public.squad_invite_links%rowtype; v_campaign public.squad_invites%rowtype; v_existing uuid; v_id uuid; v_count integer;
begin
  select * into v_link from public.squad_invite_links where token_hash = p_token_hash for update;
  if not found or v_link.status <> 'active' or v_link.expires_at <= now() then return null; end if;
  select * into v_campaign from public.squad_invites where id = v_link.campaign_id for update;
  if not found or v_campaign.campaign_status <> 'active' or v_campaign.deadline_at <= now() then return null; end if;
  select id into v_existing from public.squad_invite_participations
    where campaign_id = v_campaign.id and guardian_profile_id = p_guardian_profile_id;
  if v_existing is not null then
    update public.squad_invite_participations set builder_token_hash=p_builder_token_hash, updated_at=now() where id=v_existing;
    return jsonb_build_object('participationId',v_existing,'created',false);
  end if;
  select count(*) into v_count from public.squad_invite_participations
    where campaign_id = v_campaign.id and status <> 'cancelled';
  if v_link.participation_limit is not null and v_count >= v_link.participation_limit then
    insert into public.squad_invite_link_audit_events(link_id,campaign_id,actor_profile_id,event_type)
      values(v_link.id,v_campaign.id,p_guardian_profile_id,'limit_reached');
    return null;
  end if;
  insert into public.squad_invite_participations(campaign_id,guardian_profile_id,builder_token_hash)
    values(v_campaign.id,p_guardian_profile_id,p_builder_token_hash) returning id into v_id;
  insert into public.squad_invite_link_audit_events(link_id,campaign_id,actor_profile_id,event_type)
    values(v_link.id,v_campaign.id,p_guardian_profile_id,'participation_started');
  return jsonb_build_object('participationId',v_id,'created',true);
exception when unique_violation then
  select id into v_existing from public.squad_invite_participations
    where campaign_id = v_campaign.id and guardian_profile_id = p_guardian_profile_id;
  if v_existing is null then raise; end if;
  update public.squad_invite_participations set builder_token_hash=p_builder_token_hash, updated_at=now() where id=v_existing;
  return jsonb_build_object('participationId',v_existing,'created',false);
end;
$$;

create or replace function public.replace_squad_invite_link(
  p_campaign_id uuid, p_actor_profile_id uuid, p_token_hash text,
  p_expires_at timestamptz, p_participation_limit integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_old_id uuid; v_new_id uuid;
begin
  perform 1 from public.squad_invites where id = p_campaign_id for update;
  if not found or p_expires_at <= now() then raise exception 'campaign unavailable'; end if;
  select id into v_old_id from public.squad_invite_links
    where campaign_id = p_campaign_id and status = 'active' for update;
  if v_old_id is not null then
    update public.squad_invite_links set status='revoked', revoked_at=now() where id=v_old_id;
  end if;
  insert into public.squad_invite_links(campaign_id,token_hash,expires_at,participation_limit,created_by_profile_id)
    values(p_campaign_id,p_token_hash,p_expires_at,p_participation_limit,p_actor_profile_id) returning id into v_new_id;
  if v_old_id is not null then
    update public.squad_invite_links set replaced_by_link_id=v_new_id where id=v_old_id;
    insert into public.squad_invite_link_audit_events(link_id,campaign_id,actor_profile_id,event_type,metadata)
      values(v_old_id,p_campaign_id,p_actor_profile_id,'replaced',jsonb_build_object('replacementLinkId',v_new_id));
  end if;
  insert into public.squad_invite_link_audit_events(link_id,campaign_id,actor_profile_id,event_type)
    values(v_new_id,p_campaign_id,p_actor_profile_id,'created');
  return v_new_id;
end;
$$;

create or replace function public.consume_squad_invite_rate_limit(p_bucket_hash text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_window timestamptz; v_count integer;
begin
  if p_bucket_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 then return false; end if;
  v_window := date_trunc('hour', now()) + floor(extract(minute from now()) / 5) * interval '5 minutes';
  insert into public.squad_invite_rate_limits(bucket_hash,window_started_at,attempt_count)
    values(p_bucket_hash,v_window,1)
    on conflict(bucket_hash,window_started_at) do update set attempt_count=public.squad_invite_rate_limits.attempt_count+1
    returning attempt_count into v_count;
  return v_count <= p_limit;
end;
$$;

alter function public.resolve_squad_invite_link(text) owner to postgres;
alter function public.start_squad_invite_participation(text,uuid,text) owner to postgres;
alter function public.replace_squad_invite_link(uuid,uuid,text,timestamptz,integer) owner to postgres;
alter function public.consume_squad_invite_rate_limit(text,integer) owner to postgres;
revoke all on function public.resolve_squad_invite_link(text) from public, anon, authenticated;
revoke all on function public.start_squad_invite_participation(text,uuid,text) from public, anon, authenticated;
revoke all on function public.replace_squad_invite_link(uuid,uuid,text,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.consume_squad_invite_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.resolve_squad_invite_link(text) to service_role;
grant execute on function public.start_squad_invite_participation(text,uuid,text) to service_role;
grant execute on function public.replace_squad_invite_link(uuid,uuid,text,timestamptz,integer) to service_role;
grant execute on function public.consume_squad_invite_rate_limit(text,integer) to service_role;

comment on table public.squad_invite_links is 'Reusable invitation credentials; raw tokens are never persisted.';
comment on column public.squad_invite_links.use_count is 'Aggregate operational count only; no IP, device or participant identity is recorded for opens.';

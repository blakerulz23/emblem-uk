-- Controlled-pilot organiser request, staff review and disabled-notification
-- foundation. Additive after 0050-0051. Application access remains off unless
-- the server-only runtime feature flag is explicitly enabled.
-- STATICALLY VERIFIED ONLY — NOT EXECUTED. Transaction, concurrency, rollback,
-- grant, RLS and RPC behaviour require a separately approved database test.

alter table public.squad_invites drop constraint squad_invites_campaign_status_check;
alter table public.squad_invites add constraint squad_invites_campaign_status_check check (campaign_status in (
  'draft','awaiting_staff_approval','inactive','approved_setup_required','active','deadline_reached','grace_period',
  'pricing_finalised','paused','closed','cancelled','expired','exception'
));
alter table public.squad_invites alter column campaign_status set default 'inactive';
alter table public.squad_invites alter column delivery_address drop not null;
alter table public.squad_invites alter column delivery_postcode drop not null;
alter table public.squad_invites alter column delivery_contact drop not null;
alter table public.squad_invite_audit_events drop constraint squad_invite_audit_events_event_type_check;
alter table public.squad_invite_audit_events add constraint squad_invite_audit_events_event_type_check check (event_type in (
  'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened','builder_started',
  'commitment_completed','pricing_finalised','payment_request_reissued','payment_confirmed','payment_exception',
  'campaign_closed','campaign_cancelled','coach_card_unlocked','fulfilment_started','fulfilment_transitioned',
  'organiser_reassigned','support_requested','staff_override','delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared'
));

create table public.squad_invite_staff_permissions (
  staff_profile_id uuid not null references public.staff_accounts(profile_id) on delete cascade,
  permission text not null check (permission in ('squad_invite_reviewer','squad_invite_approver')),
  granted_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (staff_profile_id, permission)
);

create table public.squad_invite_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique default ('SI-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  organiser_profile_id uuid not null references public.profiles(id) on delete restrict,
  organiser_email text not null,
  organiser_email_verified_at timestamptz not null,
  organiser_name text not null check (char_length(trim(organiser_name)) between 2 and 120),
  organiser_role text not null check (organiser_role in ('coach_or_club_representative','team_manager','parent_representative')),
  club_team_name text not null check (char_length(trim(club_team_name)) between 2 and 120),
  football_age_group text not null check (char_length(trim(football_age_group)) between 2 and 30),
  expected_squad_size integer check (expected_squad_size between 1 and 100),
  proposed_deadline_at timestamptz not null,
  delivery_recipient_name text not null check (char_length(trim(delivery_recipient_name)) between 2 and 120),
  delivery_recipient_role text not null check (char_length(trim(delivery_recipient_role)) between 2 and 80),
  uk_delivery_confirmed boolean not null check (uk_delivery_confirmed),
  badge_reference jsonb,
  badge_authority_version text,
  badge_review_status text not null default 'not_supplied' check (badge_review_status in ('not_supplied','pending','approved','clarification_required','removed')),
  request_status text not null default 'ready_to_submit' check (request_status in ('draft','ready_to_submit','submitted','under_review','changes_requested','resubmitted','approved','rejected','cancelled','expired')),
  submission_key uuid not null,
  submission_fingerprint text not null check (submission_fingerprint ~ '^[a-f0-9]{64}$'),
  organiser_visible_reason text,
  restricted_staff_note text,
  assigned_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict,
  submitted_at timestamptz,
  review_started_at timestamptz,
  decided_at timestamptz,
  decided_by_staff_profile_id uuid references public.staff_accounts(profile_id) on delete restrict,
  campaign_id uuid unique references public.squad_invites(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organiser_profile_id, submission_key)
);
create index squad_invite_requests_queue_idx on public.squad_invite_requests(request_status, submitted_at);

create table public.squad_invite_request_declarations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.squad_invite_requests(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('organiser_authority','delivery_recipient_agreement','independent_participation','staff_review_required','badge_authority')),
  policy_version text not null,
  accepted boolean not null check (accepted),
  accepted_at timestamptz not null default now(),
  unique (request_id, purpose, policy_version)
);

create table public.squad_invite_organiser_ownership (
  campaign_id uuid primary key references public.squad_invites(id) on delete cascade,
  organiser_profile_id uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint squad_invite_ownership_revocation_coherent check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create table public.squad_invite_request_audit_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.squad_invite_requests(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_role text not null check(actor_role in ('organiser','reviewer','approver','system')),
  event_type text not null check(event_type in ('submitted','review_started','changes_requested','resubmitted','approved','rejected','approval_cancelled','notification_resend_prepared')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.squad_invite_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.squad_invite_requests(id) on delete cascade,
  campaign_id uuid references public.squad_invites(id) on delete cascade,
  event_key text not null,
  template_key text not null check (template_key in ('request_received','changes_requested','approved_link_ready','rejected','notification_failure_internal')),
  template_version integer not null default 1 check (template_version = 1),
  recipient_profile_id uuid references public.profiles(id) on delete restrict,
  status text not null default 'disabled_test' check (status in ('pending','disabled_test','processing','sent','failed','cancelled')),
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, event_key)
);

alter table public.squad_invite_staff_permissions enable row level security;
alter table public.squad_invite_requests enable row level security;
alter table public.squad_invite_request_declarations enable row level security;
alter table public.squad_invite_organiser_ownership enable row level security;
alter table public.squad_invite_request_audit_events enable row level security;
alter table public.squad_invite_notification_outbox enable row level security;
revoke all on public.squad_invite_staff_permissions, public.squad_invite_requests,
  public.squad_invite_request_declarations, public.squad_invite_organiser_ownership,
  public.squad_invite_request_audit_events, public.squad_invite_notification_outbox from public, anon, authenticated;
grant select, insert, update on public.squad_invite_staff_permissions, public.squad_invite_requests,
  public.squad_invite_request_declarations, public.squad_invite_organiser_ownership,
  public.squad_invite_request_audit_events, public.squad_invite_notification_outbox to service_role;
grant usage,select on sequence public.squad_invite_request_audit_events_id_seq to service_role;

create or replace function public.submit_squad_invite_request(
  p_profile_id uuid, p_email text, p_submission_key uuid, p_fingerprint text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.squad_invite_requests%rowtype; v_request public.squad_invite_requests%rowtype; v_role text;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid submission'; end if;
  select * into v_existing from public.squad_invite_requests where organiser_profile_id=p_profile_id and submission_key=p_submission_key for update;
  if found then
    if v_existing.submission_fingerprint<>p_fingerprint then raise exception 'submission key conflict'; end if;
    return jsonb_build_object('created',false,'requestId',v_existing.id,'publicReference',v_existing.public_reference,'status',v_existing.request_status);
  end if;
  v_role := p_payload->>'organiserRole';
  if v_role not in ('coach_or_club_representative','team_manager','parent_representative') then raise exception 'invalid organiser role'; end if;
  if (p_payload->>'authorityAccepted')::boolean is not true or (p_payload->>'deliveryRecipientAccepted')::boolean is not true
    or (p_payload->>'independentParticipationAccepted')::boolean is not true or (p_payload->>'staffReviewAccepted')::boolean is not true
    or (p_payload->>'ukDeliveryConfirmed')::boolean is not true then raise exception 'required declaration missing'; end if;
  insert into public.squad_invite_requests(organiser_profile_id,organiser_email,organiser_email_verified_at,organiser_name,organiser_role,
    club_team_name,football_age_group,expected_squad_size,proposed_deadline_at,delivery_recipient_name,delivery_recipient_role,
    uk_delivery_confirmed,badge_reference,badge_authority_version,badge_review_status,request_status,submission_key,submission_fingerprint,submitted_at)
  values(p_profile_id,lower(trim(p_email)),now(),trim(p_payload->>'organiserName'),v_role,trim(p_payload->>'teamName'),
    trim(p_payload->>'ageGroup'),(p_payload->>'expectedSquadSize')::integer,(p_payload->>'deadlineAt')::timestamptz,
    trim(p_payload->>'deliveryRecipientName'),trim(p_payload->>'deliveryRecipientRole'),true,p_payload->'badgeReference',
    case when p_payload ? 'badgeReference' then 'squad_invite_badge_authority_v1' else null end,
    case when p_payload ? 'badgeReference' then 'pending' else 'not_supplied' end,'submitted',p_submission_key,p_fingerprint,now()) returning * into v_request;
  insert into public.squad_invite_request_declarations(request_id,actor_profile_id,purpose,policy_version,accepted)
  values(v_request.id,p_profile_id,'organiser_authority','squad_invite_organiser_authority_v1',true),
    (v_request.id,p_profile_id,'delivery_recipient_agreement','squad_invite_delivery_recipient_v1',true),
    (v_request.id,p_profile_id,'independent_participation','squad_invite_independent_participation_v1',true),
    (v_request.id,p_profile_id,'staff_review_required','squad_invite_staff_review_v1',true);
  if p_payload ? 'badgeReference' then insert into public.squad_invite_request_declarations(request_id,actor_profile_id,purpose,policy_version,accepted)
    values(v_request.id,p_profile_id,'badge_authority','squad_invite_badge_authority_v1',true); end if;
  insert into public.squad_invite_notification_outbox(request_id,event_key,template_key,recipient_profile_id,status)
    values(v_request.id,'request_received:v1','request_received',p_profile_id,'disabled_test');
  insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(v_request.id,p_profile_id,'organiser','submitted');
  return jsonb_build_object('created',true,'requestId',v_request.id,'publicReference',v_request.public_reference,'status','submitted');
end; $$;

alter function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) owner to postgres;
revoke all on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) to service_role;

create or replace function public.approve_squad_invite_request(
  p_request_id uuid, p_staff_profile_id uuid, p_parent_link_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.squad_invite_requests%rowtype; v_campaign_id uuid; v_link_id uuid; v_allowed boolean;
begin
  select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null) into v_allowed;
  if not v_allowed then raise exception 'squad invite approval unavailable'; end if;
  if p_parent_link_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid link credential'; end if;
  select * into v_request from public.squad_invite_requests where id=p_request_id for update;
  if not found then raise exception 'request unavailable'; end if;
  if v_request.request_status='approved' then
    return jsonb_build_object('created',false,'requestId',v_request.id,'campaignId',v_request.campaign_id,'status','approved');
  end if;
  if v_request.request_status not in ('submitted','under_review','resubmitted') then raise exception 'request is not approvable'; end if;
  insert into public.squad_invites(organiser_profile_id,organiser_role,club_team_name,football_age_group,badge_reference,
    expected_squad_size,authority_declaration_version,terms_version,privacy_version,campaign_status,deadline_at,
    delivery_recipient_name,delivery_recipient_role,recipient_distribution_accepted_at,approved_by_staff_profile_id,approved_at)
  values(v_request.organiser_profile_id,v_request.organiser_role,v_request.club_team_name,v_request.football_age_group,
    case when v_request.badge_review_status='approved' then v_request.badge_reference else null end,v_request.expected_squad_size,
    'squad_invite_organiser_authority_v1','squad_invite_terms_v1','squad_invite_privacy_v1','approved_setup_required',
    v_request.proposed_deadline_at,v_request.delivery_recipient_name,v_request.delivery_recipient_role,now(),p_staff_profile_id,now()) returning id into v_campaign_id;
  insert into public.squad_invite_organiser_ownership(campaign_id,organiser_profile_id) values(v_campaign_id,v_request.organiser_profile_id);
  insert into public.squad_invite_links(campaign_id,token_hash,status,expires_at,created_by_profile_id)
    values(v_campaign_id,p_parent_link_hash,'paused',v_request.proposed_deadline_at + interval '24 hours',p_staff_profile_id) returning id into v_link_id;
  update public.squad_invite_requests set request_status='approved',campaign_id=v_campaign_id,decided_at=now(),decided_by_staff_profile_id=p_staff_profile_id,updated_at=now() where id=v_request.id;
  insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(v_request.id,p_staff_profile_id,'approver','approved');
  insert into public.squad_invite_notification_outbox(request_id,campaign_id,event_key,template_key,recipient_profile_id,status)
    values(v_request.id,v_campaign_id,'approval:v1','approved_link_ready',v_request.organiser_profile_id,'disabled_test');
  insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type,metadata)
    values(v_campaign_id,p_staff_profile_id,'staff','campaign_approved',jsonb_build_object('requestReference',v_request.public_reference,'linkId',v_link_id));
  return jsonb_build_object('created',true,'requestId',v_request.id,'campaignId',v_campaign_id,'status','approved_setup_required');
end; $$;

alter function public.approve_squad_invite_request(uuid,uuid,text) owner to postgres;
revoke all on function public.approve_squad_invite_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.approve_squad_invite_request(uuid,uuid,text) to service_role;

create or replace function public.complete_squad_invite_delivery_and_activate(
  p_request_id uuid, p_organiser_profile_id uuid, p_address text, p_postcode text,
  p_courier_contact text, p_instructions text, p_new_link_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.squad_invite_requests%rowtype; v_campaign public.squad_invites%rowtype; v_link_id uuid;
begin
  if p_new_link_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid link credential'; end if;
  if char_length(trim(p_address)) not between 5 and 500 or char_length(trim(p_postcode)) not between 5 and 10
    or char_length(trim(p_courier_contact)) not between 3 and 160 or char_length(coalesce(p_instructions,'')) > 300 then raise exception 'invalid delivery setup'; end if;
  select * into v_request from public.squad_invite_requests where id=p_request_id for update;
  if not found or v_request.request_status<>'approved' or v_request.organiser_profile_id<>p_organiser_profile_id or v_request.campaign_id is null then raise exception 'setup unavailable'; end if;
  select * into v_campaign from public.squad_invites where id=v_request.campaign_id for update;
  if not found or v_campaign.organiser_profile_id<>p_organiser_profile_id then raise exception 'setup unavailable'; end if;
  if v_campaign.campaign_status='active' then return jsonb_build_object('created',false,'status','active','campaignId',v_campaign.id); end if;
  if v_campaign.campaign_status<>'approved_setup_required' or v_campaign.deadline_at<=now() then raise exception 'setup unavailable'; end if;
  update public.squad_invite_links set status='revoked',revoked_at=now() where campaign_id=v_campaign.id and status in ('active','paused');
  insert into public.squad_invite_links(campaign_id,token_hash,status,expires_at,created_by_profile_id)
    values(v_campaign.id,p_new_link_hash,'active',v_campaign.grace_ends_at,p_organiser_profile_id) returning id into v_link_id;
  update public.squad_invites set delivery_address=trim(p_address),delivery_postcode=upper(trim(p_postcode)),delivery_contact=trim(p_courier_contact),
    delivery_instructions=nullif(trim(coalesce(p_instructions,'')),''),campaign_status='active',published_at=coalesce(published_at,now()),updated_at=now() where id=v_campaign.id;
  insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type) values(v_campaign.id,p_organiser_profile_id,'organiser','delivery_setup_completed');
  insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type,metadata) values(v_campaign.id,p_organiser_profile_id,'organiser','campaign_activated',jsonb_build_object('linkId',v_link_id));
  return jsonb_build_object('created',true,'status','active','campaignId',v_campaign.id,'teamName',v_campaign.club_team_name,'deadlineAt',v_campaign.deadline_at);
end; $$;
alter function public.complete_squad_invite_delivery_and_activate(uuid,uuid,text,text,text,text,text) owner to postgres;
revoke all on function public.complete_squad_invite_delivery_and_activate(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_squad_invite_delivery_and_activate(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.cancel_squad_invite_approval(p_request_id uuid,p_staff_profile_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.squad_invite_requests%rowtype; v_allowed boolean;
begin
 select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null) into v_allowed;
 if not v_allowed or char_length(trim(p_reason))<3 then raise exception 'cancellation unavailable'; end if;
 select * into v_request from public.squad_invite_requests where id=p_request_id for update;
 if not found then raise exception 'cancellation unavailable'; end if;
 if v_request.request_status='cancelled' then return jsonb_build_object('created',false,'status','cancelled'); end if;
 if v_request.request_status<>'approved' or v_request.campaign_id is null then raise exception 'cancellation unavailable'; end if;
 update public.squad_invites set campaign_status='cancelled',cancelled_at=now(),updated_at=now() where id=v_request.campaign_id and campaign_status='approved_setup_required';
 if not found then raise exception 'cancellation unavailable'; end if;
 update public.squad_invite_links set status='revoked',revoked_at=now() where campaign_id=v_request.campaign_id and status in ('active','paused');
 update public.squad_invite_requests set request_status='cancelled',organiser_visible_reason=trim(p_reason),decided_at=now(),decided_by_staff_profile_id=p_staff_profile_id,updated_at=now() where id=p_request_id;
 insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(p_request_id,p_staff_profile_id,'approver','approval_cancelled');
 insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type) values(v_request.campaign_id,p_staff_profile_id,'staff','approval_cancelled');
 return jsonb_build_object('created',true,'status','cancelled');
end; $$;
alter function public.cancel_squad_invite_approval(uuid,uuid,text) owner to postgres;
revoke all on function public.cancel_squad_invite_approval(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_squad_invite_approval(uuid,uuid,text) to service_role;

create or replace function public.prepare_squad_invite_notification_resend(p_outbox_id uuid,p_staff_profile_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_outbox public.squad_invite_notification_outbox%rowtype; v_allowed boolean;
begin
 select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null) into v_allowed;
 if not v_allowed then raise exception 'resend unavailable'; end if;
 select * into v_outbox from public.squad_invite_notification_outbox where id=p_outbox_id for update;
 if not found or v_outbox.status not in ('disabled_test','failed','pending') then raise exception 'resend unavailable'; end if;
 update public.squad_invite_notification_outbox set status='disabled_test',attempt_count=attempt_count+1,last_error_code=null,failed_at=null,updated_at=now() where id=p_outbox_id;
 insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type,metadata) values(v_outbox.request_id,p_staff_profile_id,'approver','notification_resend_prepared',jsonb_build_object('outboxId',p_outbox_id));
 if v_outbox.campaign_id is not null then insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type,metadata) values(v_outbox.campaign_id,p_staff_profile_id,'staff','notification_resend_prepared',jsonb_build_object('outboxId',p_outbox_id)); end if;
 return jsonb_build_object('prepared',true,'deliveryMode','disabled_test');
end; $$;
alter function public.prepare_squad_invite_notification_resend(uuid,uuid) owner to postgres;
revoke all on function public.prepare_squad_invite_notification_resend(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_squad_invite_notification_resend(uuid,uuid) to service_role;

create or replace function public.resubmit_squad_invite_request(p_request_id uuid,p_organiser_profile_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.squad_invite_requests%rowtype;
begin
 select * into v_request from public.squad_invite_requests where id=p_request_id for update;
 if not found or v_request.organiser_profile_id<>p_organiser_profile_id or v_request.request_status<>'changes_requested' then raise exception 'resubmission unavailable'; end if;
 if (p_payload->>'authorityAccepted')::boolean is not true or (p_payload->>'staffReviewAccepted')::boolean is not true then raise exception 'required declaration missing'; end if;
 update public.squad_invite_requests set organiser_name=trim(coalesce(p_payload->>'organiserName',organiser_name)),club_team_name=trim(coalesce(p_payload->>'teamName',club_team_name)),
   football_age_group=trim(coalesce(p_payload->>'ageGroup',football_age_group)),expected_squad_size=coalesce((p_payload->>'expectedSquadSize')::integer,expected_squad_size),
   proposed_deadline_at=coalesce((p_payload->>'deadlineAt')::timestamptz,proposed_deadline_at),delivery_recipient_name=trim(coalesce(p_payload->>'deliveryRecipientName',delivery_recipient_name)),
   delivery_recipient_role=trim(coalesce(p_payload->>'deliveryRecipientRole',delivery_recipient_role)),request_status='resubmitted',organiser_visible_reason=null,submitted_at=now(),updated_at=now()
 where id=p_request_id;
 insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(p_request_id,p_organiser_profile_id,'organiser','resubmitted');
 insert into public.squad_invite_request_declarations(request_id,actor_profile_id,purpose,policy_version,accepted)
 values(p_request_id,p_organiser_profile_id,'organiser_authority','squad_invite_organiser_authority_v1',true),
 (p_request_id,p_organiser_profile_id,'staff_review_required','squad_invite_staff_review_v1',true)
 on conflict(request_id,purpose,policy_version) do update set accepted=true,accepted_at=now(),actor_profile_id=excluded.actor_profile_id;
 return jsonb_build_object('created',true,'status','resubmitted','publicReference',v_request.public_reference);
end; $$;
alter function public.resubmit_squad_invite_request(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.resubmit_squad_invite_request(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.resubmit_squad_invite_request(uuid,uuid,jsonb) to service_role;

create or replace function public.review_squad_invite_request(p_request_id uuid,p_staff_profile_id uuid,p_action text,p_visible_reason text,p_restricted_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.squad_invite_requests%rowtype; v_reviewer boolean; v_approver boolean; v_next text; v_event text;
begin
 select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_reviewer' and revoked_at is null),
        exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null)
 into v_reviewer,v_approver;
 if (p_action in ('start_review','request_changes') and not v_reviewer) or (p_action='reject' and not v_approver) then raise exception 'review unavailable'; end if;
 if p_action not in ('start_review','request_changes','reject') then raise exception 'review unavailable'; end if;
 if p_action in ('request_changes','reject') and char_length(trim(coalesce(p_visible_reason,'')))<3 then raise exception 'reason required'; end if;
 select * into v_request from public.squad_invite_requests where id=p_request_id for update;if not found then raise exception 'review unavailable';end if;
 if p_action='start_review' and v_request.request_status not in ('submitted','resubmitted') then raise exception 'review unavailable';end if;
 if p_action in ('request_changes','reject') and v_request.request_status<>'under_review' then raise exception 'review unavailable';end if;
 v_next:=case p_action when 'start_review' then 'under_review' when 'request_changes' then 'changes_requested' else 'rejected' end;
 v_event:=case p_action when 'start_review' then 'review_started' when 'request_changes' then 'changes_requested' else 'rejected' end;
 update public.squad_invite_requests set request_status=v_next,organiser_visible_reason=case when p_action='start_review' then null else trim(p_visible_reason) end,
 restricted_staff_note=nullif(trim(coalesce(p_restricted_note,'')),''),assigned_staff_profile_id=p_staff_profile_id,
 review_started_at=case when p_action='start_review' then now() else review_started_at end,
 decided_at=case when p_action='reject' then now() else null end,decided_by_staff_profile_id=case when p_action='reject' then p_staff_profile_id else null end,updated_at=now() where id=p_request_id;
 insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(p_request_id,p_staff_profile_id,case when p_action='reject' then 'approver' else 'reviewer' end,v_event);
 if p_action in ('request_changes','reject') then insert into public.squad_invite_notification_outbox(request_id,event_key,template_key,recipient_profile_id,status)
   values(p_request_id,v_next||':v1',case when p_action='request_changes' then 'changes_requested' else 'rejected' end,v_request.organiser_profile_id,'disabled_test')
   on conflict(request_id,event_key) do nothing; end if;
 return jsonb_build_object('created',true,'status',v_next);
end; $$;
alter function public.review_squad_invite_request(uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.review_squad_invite_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.review_squad_invite_request(uuid,uuid,text,text,text) to service_role;

comment on table public.squad_invite_notification_outbox is 'Disabled/test lifecycle outbox. Raw credentials, delivery addresses and child data are prohibited.';
comment on column public.squad_invite_requests.public_reference is 'Non-secret display reference; never sufficient for authorisation.';

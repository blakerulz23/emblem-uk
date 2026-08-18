-- Forward correction: declarations and request audit events are immutable evidence.
-- A resubmission creates a server-assigned revision and a fresh declaration set.

alter table public.squad_invite_requests
  add column submission_revision integer not null default 1,
  add constraint squad_invite_requests_submission_revision_check check (submission_revision > 0);

alter table public.squad_invite_request_declarations add column submission_revision integer;
update public.squad_invite_request_declarations set submission_revision = 1 where submission_revision is null;
alter table public.squad_invite_request_declarations
  alter column submission_revision set not null,
  add constraint squad_invite_request_declarations_revision_check check (submission_revision > 0),
  drop constraint squad_invite_request_declarat_request_id_purpose_policy_ver_key,
  add constraint squad_invite_request_declarations_revision_purpose_key
    unique (request_id, submission_revision, purpose);

revoke update, delete on public.squad_invite_request_declarations from public, anon, authenticated, service_role;
revoke update, delete on public.squad_invite_request_audit_events from public, anon, authenticated, service_role;
grant select, insert on public.squad_invite_request_declarations to service_role;
grant select, insert on public.squad_invite_request_audit_events to service_role;

create function public.reject_squad_invite_history_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Squad Invite review history is append-only' using errcode = '55000';
end;
$$;
alter function public.reject_squad_invite_history_mutation() owner to postgres;
revoke all on function public.reject_squad_invite_history_mutation() from public, anon, authenticated, service_role;

create trigger squad_invite_declarations_append_only
before update or delete on public.squad_invite_request_declarations
for each row execute function public.reject_squad_invite_history_mutation();

create trigger squad_invite_request_audit_append_only
before update or delete on public.squad_invite_request_audit_events
for each row execute function public.reject_squad_invite_history_mutation();

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
    uk_delivery_confirmed,badge_reference,badge_authority_version,badge_review_status,request_status,submission_key,submission_fingerprint,submission_revision,submitted_at)
  values(p_profile_id,lower(trim(p_email)),now(),trim(p_payload->>'organiserName'),v_role,trim(p_payload->>'teamName'),
    trim(p_payload->>'ageGroup'),(p_payload->>'expectedSquadSize')::integer,(p_payload->>'deadlineAt')::timestamptz,
    trim(p_payload->>'deliveryRecipientName'),trim(p_payload->>'deliveryRecipientRole'),true,p_payload->'badgeReference',
    case when p_payload ? 'badgeReference' then 'squad_invite_badge_authority_v1' else null end,
    case when p_payload ? 'badgeReference' then 'pending' else 'not_supplied' end,'submitted',p_submission_key,p_fingerprint,1,now()) returning * into v_request;
  insert into public.squad_invite_request_declarations(request_id,submission_revision,actor_profile_id,purpose,policy_version,accepted)
  values(v_request.id,1,p_profile_id,'organiser_authority','squad_invite_organiser_authority_v1',true),
    (v_request.id,1,p_profile_id,'delivery_recipient_agreement','squad_invite_delivery_recipient_v1',true),
    (v_request.id,1,p_profile_id,'independent_participation','squad_invite_independent_participation_v1',true),
    (v_request.id,1,p_profile_id,'staff_review_required','squad_invite_staff_review_v1',true);
  if p_payload ? 'badgeReference' then insert into public.squad_invite_request_declarations(request_id,submission_revision,actor_profile_id,purpose,policy_version,accepted)
    values(v_request.id,1,p_profile_id,'badge_authority','squad_invite_badge_authority_v1',true); end if;
  insert into public.squad_invite_notification_outbox(request_id,event_key,template_key,recipient_profile_id,status)
    values(v_request.id,'request_received:v1','request_received',p_profile_id,'disabled_test');
  insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type) values(v_request.id,p_profile_id,'organiser','submitted');
  return jsonb_build_object('created',true,'requestId',v_request.id,'publicReference',v_request.public_reference,'status','submitted');
end; $$;
alter function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) owner to postgres;
revoke all on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) to service_role;

create or replace function public.resubmit_squad_invite_request(p_request_id uuid,p_organiser_profile_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.squad_invite_requests%rowtype; v_next_revision integer;
begin
 select * into v_request from public.squad_invite_requests where id=p_request_id for update;
 if not found or v_request.organiser_profile_id<>p_organiser_profile_id or v_request.request_status<>'changes_requested' then raise exception 'resubmission unavailable'; end if;
 if (p_payload->>'authorityAccepted')::boolean is not true or (p_payload->>'deliveryRecipientAccepted')::boolean is not true
   or (p_payload->>'independentParticipationAccepted')::boolean is not true or (p_payload->>'staffReviewAccepted')::boolean is not true then raise exception 'required declaration missing'; end if;
 if v_request.submission_revision = 2147483647 then raise exception 'resubmission unavailable'; end if;
 v_next_revision := v_request.submission_revision + 1;
 update public.squad_invite_requests set organiser_name=trim(coalesce(p_payload->>'organiserName',organiser_name)),club_team_name=trim(coalesce(p_payload->>'teamName',club_team_name)),
   football_age_group=trim(coalesce(p_payload->>'ageGroup',football_age_group)),expected_squad_size=coalesce((p_payload->>'expectedSquadSize')::integer,expected_squad_size),
   proposed_deadline_at=coalesce((p_payload->>'deadlineAt')::timestamptz,proposed_deadline_at),delivery_recipient_name=trim(coalesce(p_payload->>'deliveryRecipientName',delivery_recipient_name)),
   delivery_recipient_role=trim(coalesce(p_payload->>'deliveryRecipientRole',delivery_recipient_role)),submission_revision=v_next_revision,
   request_status='resubmitted',organiser_visible_reason=null,submitted_at=now(),updated_at=now() where id=p_request_id;
 insert into public.squad_invite_request_declarations(request_id,submission_revision,actor_profile_id,purpose,policy_version,accepted)
 values(p_request_id,v_next_revision,p_organiser_profile_id,'organiser_authority','squad_invite_organiser_authority_v1',true),
 (p_request_id,v_next_revision,p_organiser_profile_id,'delivery_recipient_agreement','squad_invite_delivery_recipient_v1',true),
 (p_request_id,v_next_revision,p_organiser_profile_id,'independent_participation','squad_invite_independent_participation_v1',true),
 (p_request_id,v_next_revision,p_organiser_profile_id,'staff_review_required','squad_invite_staff_review_v1',true);
 insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type,metadata)
 values(p_request_id,p_organiser_profile_id,'organiser','resubmitted',jsonb_build_object('submissionRevision',v_next_revision));
 return jsonb_build_object('created',true,'status','resubmitted','publicReference',v_request.public_reference);
end; $$;
alter function public.resubmit_squad_invite_request(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.resubmit_squad_invite_request(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.resubmit_squad_invite_request(uuid,uuid,jsonb) to service_role;

create or replace function public.approve_squad_invite_request(
  p_request_id uuid, p_staff_profile_id uuid, p_parent_link_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.squad_invite_requests%rowtype; v_campaign_id uuid; v_link_id uuid; v_allowed boolean; v_declaration_count integer;
begin
  select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null) into v_allowed;
  if not v_allowed then raise exception 'squad invite approval unavailable'; end if;
  if p_parent_link_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid link credential'; end if;
  select * into v_request from public.squad_invite_requests where id=p_request_id for update;
  if not found then raise exception 'request unavailable'; end if;
  if v_request.request_status='approved' then return jsonb_build_object('created',false,'requestId',v_request.id,'campaignId',v_request.campaign_id,'status','approved'); end if;
  if v_request.request_status not in ('submitted','under_review','resubmitted') then raise exception 'request is not approvable'; end if;
  select count(*) into v_declaration_count from public.squad_invite_request_declarations
    where request_id=v_request.id and submission_revision=v_request.submission_revision and accepted
      and (purpose,policy_version) in (('organiser_authority','squad_invite_organiser_authority_v1'),
        ('delivery_recipient_agreement','squad_invite_delivery_recipient_v1'),
        ('independent_participation','squad_invite_independent_participation_v1'),
        ('staff_review_required','squad_invite_staff_review_v1'));
  if v_declaration_count<>4 then raise exception 'current submission declarations incomplete'; end if;
  insert into public.squad_invites(organiser_profile_id,organiser_role,club_team_name,football_age_group,badge_reference,expected_squad_size,
    authority_declaration_version,terms_version,privacy_version,campaign_status,deadline_at,delivery_recipient_name,delivery_recipient_role,
    recipient_distribution_accepted_at,approved_by_staff_profile_id,approved_at)
  values(v_request.organiser_profile_id,v_request.organiser_role,v_request.club_team_name,v_request.football_age_group,
    case when v_request.badge_review_status='approved' then v_request.badge_reference else null end,v_request.expected_squad_size,
    'squad_invite_organiser_authority_v1','squad_invite_terms_v1','squad_invite_privacy_v1','approved_setup_required',v_request.proposed_deadline_at,
    v_request.delivery_recipient_name,v_request.delivery_recipient_role,now(),p_staff_profile_id,now()) returning id into v_campaign_id;
  insert into public.squad_invite_organiser_ownership(campaign_id,organiser_profile_id) values(v_campaign_id,v_request.organiser_profile_id);
  insert into public.squad_invite_links(campaign_id,token_hash,status,expires_at,created_by_profile_id)
    values(v_campaign_id,p_parent_link_hash,'paused',v_request.proposed_deadline_at + interval '24 hours',p_staff_profile_id) returning id into v_link_id;
  update public.squad_invite_requests set request_status='approved',campaign_id=v_campaign_id,decided_at=now(),decided_by_staff_profile_id=p_staff_profile_id,updated_at=now() where id=v_request.id;
  insert into public.squad_invite_request_audit_events(request_id,actor_profile_id,actor_role,event_type,metadata)
    values(v_request.id,p_staff_profile_id,'approver','approved',jsonb_build_object('submissionRevision',v_request.submission_revision));
  insert into public.squad_invite_notification_outbox(request_id,campaign_id,event_key,template_key,recipient_profile_id,status)
    values(v_request.id,v_campaign_id,'approval:v1','approved_link_ready',v_request.organiser_profile_id,'disabled_test');
  insert into public.squad_invite_audit_events(campaign_id,actor_profile_id,actor_role,event_type,metadata)
    values(v_campaign_id,p_staff_profile_id,'staff','campaign_approved',jsonb_build_object('requestReference',v_request.public_reference,'linkId',v_link_id));
  return jsonb_build_object('created',true,'requestId',v_request.id,'campaignId',v_campaign_id,'status','approved_setup_required');
end; $$;
alter function public.approve_squad_invite_request(uuid,uuid,text) owner to postgres;
revoke all on function public.approve_squad_invite_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.approve_squad_invite_request(uuid,uuid,text) to service_role;

comment on column public.squad_invite_requests.submission_revision is 'Server-assigned current declaration revision; organisers cannot choose or decrement it.';
comment on column public.squad_invite_request_declarations.submission_revision is 'Immutable submission revision to which this declaration evidence belongs.';
comment on function public.reject_squad_invite_history_mutation() is 'Trigger-only guard enforcing append-only Squad Invite declaration and request audit history.';

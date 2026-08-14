-- Make concurrent first submissions idempotent at the database boundary.
-- The explicit conflict target is intentionally limited to the request identity;
-- unrelated uniqueness failures must remain visible and roll back the whole call.
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
    case when p_payload ? 'badgeReference' then 'pending' else 'not_supplied' end,'submitted',p_submission_key,p_fingerprint,1,now())
  on conflict (organiser_profile_id,submission_key) do nothing
  returning * into v_request;

  -- ON CONFLICT waits for the competing transaction. The loser then reads the
  -- committed winner and applies the existing fingerprint response contract.
  if v_request.id is null then
    select * into v_existing from public.squad_invite_requests
      where organiser_profile_id=p_profile_id and submission_key=p_submission_key for update;
    if not found then raise exception 'invalid submission'; end if;
    if v_existing.submission_fingerprint<>p_fingerprint then raise exception 'submission key conflict'; end if;
    return jsonb_build_object('created',false,'requestId',v_existing.id,'publicReference',v_existing.public_reference,'status',v_existing.request_status);
  end if;

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
revoke all on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) from public;
revoke all on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) from anon;
revoke all on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) from authenticated;
grant execute on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) to service_role;

comment on function public.submit_squad_invite_request(uuid,text,uuid,text,jsonb) is
  'Creates one review request atomically; concurrent retries are idempotent only for the organiser/submission-key identity.';

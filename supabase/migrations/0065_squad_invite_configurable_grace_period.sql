-- Makes the Squad Invite commitment grace period configurable per
-- environment, without changing production's real behaviour.
--
-- Previously derive_squad_invite_grace_end() unconditionally overwrote
-- grace_ends_at := deadline_at + interval '24 hours' on every insert/
-- update of deadline_at — a hardcoded 24h that became a real blocker
-- testing the pricing-finalisation flow on a live campaign, with no
-- data-level way around it (deadline_at itself is separately constrained
-- to be > created_at, and grace_ends_at is always +24h from whatever
-- deadline_at ends up being).
--
-- This turns the trigger into a fallback rather than an override, but a
-- fallback still has to keep grace_ends_at meaning something whenever
-- deadline_at moves — a plain "only fill when null" version stops
-- maintaining that invariant after the row's first write, since an
-- UPDATE that only touches deadline_at carries the existing (non-null)
-- grace_ends_at forward untouched, silently going stale. That's not
-- hypothetical: it's exactly the shape of a manual admin deadline_at
-- update (used earlier tonight, on a real campaign, to unblock testing).
--
-- The actual rule: recompute grace_ends_at whenever deadline_at changed
-- and grace_ends_at did NOT change in the same statement — the caller
-- only meant to move the deadline. If both changed together, the caller
-- meant it; leave their value alone. INSERT has no OLD row to compare
-- against, so it keeps the simple null-fallback (every existing caller,
-- including approve_squad_invite_request without p_grace_hours, still
-- gets byte-identical behaviour — exactly 24h).
create or replace function public.derive_squad_invite_grace_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.grace_ends_at is null then
      new.grace_ends_at := new.deadline_at + interval '24 hours';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.deadline_at is distinct from old.deadline_at
       and new.grace_ends_at is not distinct from old.grace_ends_at then
      new.grace_ends_at := new.deadline_at + interval '24 hours';
    elsif new.grace_ends_at is null then
      new.grace_ends_at := new.deadline_at + interval '24 hours';
    end if;
  end if;
  return new;
end;
$$;

alter function public.derive_squad_invite_grace_end() owner to postgres;
revoke all on function public.derive_squad_invite_grace_end() from public, anon, authenticated, service_role;

comment on function public.derive_squad_invite_grace_end() is
  'Fallback, not an override (0065) — INSERT fills grace_ends_at as deadline_at + 24h only when left null. UPDATE recomputes the same way whenever deadline_at changed and grace_ends_at did not change in the same statement (a deadline-only admin update stays correct); if both changed together, the caller''s explicit grace_ends_at wins untouched. approve_squad_invite_request supplies both explicitly via p_grace_hours; every older/other caller is unaffected.';

-- Adding a parameter (even with a default) creates a second, overloaded
-- function rather than replacing the original — `create or replace`
-- only replaces a function with the exact same argument signature. The
-- old 3-arg version must be dropped explicitly, otherwise PostgREST has
-- two ambiguous candidates for any 3-argument call (this route's own
-- existing service.rpc(...) call, unchanged by this migration, until
-- the route ships alongside it).
drop function if exists public.approve_squad_invite_request(uuid, uuid, text);

create or replace function public.approve_squad_invite_request(
  p_request_id uuid, p_staff_profile_id uuid, p_parent_link_hash text, p_grace_hours integer default 24
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.squad_invite_requests%rowtype; v_campaign_id uuid; v_link_id uuid; v_allowed boolean;
begin
  select exists(select 1 from public.squad_invite_staff_permissions where staff_profile_id=p_staff_profile_id and permission='squad_invite_approver' and revoked_at is null) into v_allowed;
  if not v_allowed then raise exception 'squad invite approval unavailable'; end if;
  if p_parent_link_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid link credential'; end if;
  if p_grace_hours is null or p_grace_hours < 1 or p_grace_hours > 720 then raise exception 'invalid grace period'; end if;
  select * into v_request from public.squad_invite_requests where id=p_request_id for update;
  if not found then raise exception 'request unavailable'; end if;
  if v_request.request_status='approved' then
    return jsonb_build_object('created',false,'requestId',v_request.id,'campaignId',v_request.campaign_id,'status','approved');
  end if;
  if v_request.request_status not in ('submitted','under_review','resubmitted') then raise exception 'request is not approvable'; end if;
  insert into public.squad_invites(organiser_profile_id,organiser_role,club_team_name,football_age_group,badge_reference,
    expected_squad_size,authority_declaration_version,terms_version,privacy_version,campaign_status,deadline_at,grace_ends_at,
    delivery_recipient_name,delivery_recipient_role,recipient_distribution_accepted_at,approved_by_staff_profile_id,approved_at)
  values(v_request.organiser_profile_id,v_request.organiser_role,v_request.club_team_name,v_request.football_age_group,
    case when v_request.badge_review_status='approved' then v_request.badge_reference else null end,v_request.expected_squad_size,
    'squad_invite_organiser_authority_v1','squad_invite_terms_v1','squad_invite_privacy_v1','approved_setup_required',
    v_request.proposed_deadline_at,v_request.proposed_deadline_at + (p_grace_hours || ' hours')::interval,
    v_request.delivery_recipient_name,v_request.delivery_recipient_role,now(),p_staff_profile_id,now()) returning id into v_campaign_id;
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

alter function public.approve_squad_invite_request(uuid,uuid,text,integer) owner to postgres;
revoke all on function public.approve_squad_invite_request(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.approve_squad_invite_request(uuid,uuid,text,integer) to service_role;

comment on function public.approve_squad_invite_request(uuid,uuid,text,integer) is
  'Unchanged behaviour when p_grace_hours is omitted/24 (the default) — supplies grace_ends_at explicitly (0065) so the fallback trigger never needs to derive it here, letting the caller (approve/route.ts, via SQUAD_INVITE_GRACE_HOURS) control the real interval per environment.';

-- Wires the free coach-card incentive end-to-end. Before this migration,
-- squad_invites.coach_card_eligible could never become true: nothing ever
-- set a squad_invite_participations row to status='paid', and the one
-- function that recomputes eligibility from that status
-- (reconcile_squad_invite_coach_eligibility, 0050) was never called by any
-- route. Even once eligible, squad_invite_coach_cards requires
-- full_name/role_title/photo_key/design all not null — there was no way to
-- create even a placeholder row, so an organiser had no path to actually
-- submit the coach's details.
--
-- The starting array here is the live constraint as it actually exists
-- today (verified via pg_get_constraintdef against the disposable project,
-- matching the 24-value array already in 0057 exactly — no drift). Adding
-- three new values for the coach-card submission/review lifecycle;
-- coach_card_unlocked already exists, for the eligibility-flip event itself.
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
      'coach_card_submitted','coach_card_locked','coach_card_changes_requested'
    ]));

-- The missing link between a real Shopify payment and coach-card
-- eligibility. Called once per order from the orders-paid webhook — idempotent
-- (a second call for an already-paid participation is a safe no-op) and
-- silently a no-op for any order_id that isn't linked to a Squad Invite
-- participation at all (a normal order), so the webhook can call this
-- unconditionally for every squad_invite-sourced order without its own
-- existence check first.
--
-- Delegates the actual eligibility recompute to the existing
-- reconcile_squad_invite_coach_eligibility (0050) rather than duplicating
-- its >=10-paid-orders logic here — this function's only new job is the
-- participation status transition and the audit trail around it.
create or replace function public.mark_squad_invite_participation_paid(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_was_eligible boolean;
  v_now_eligible boolean;
begin
  select * into v_participation from public.squad_invite_participations where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'not a squad invite order');
  end if;
  if v_participation.status = 'paid' then
    return jsonb_build_object('applied', false, 'reason', 'already paid');
  end if;

  select coach_card_eligible into v_was_eligible from public.squad_invites where id = v_participation.campaign_id;

  update public.squad_invite_participations
  set status = 'paid', payment_completed_at = now(), updated_at = now()
  where id = v_participation.id;

  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_role, event_type, metadata)
  values (v_participation.campaign_id, v_participation.id, 'system', 'payment_confirmed', jsonb_build_object('orderId', p_order_id));

  v_now_eligible := public.reconcile_squad_invite_coach_eligibility(v_participation.campaign_id);

  if v_now_eligible and not coalesce(v_was_eligible, false) then
    insert into public.squad_invite_audit_events(campaign_id, actor_role, event_type, metadata)
    values (v_participation.campaign_id, 'system', 'coach_card_unlocked', jsonb_build_object('triggeredByOrderId', p_order_id));
  end if;

  return jsonb_build_object('applied', true, 'participationId', v_participation.id, 'campaignId', v_participation.campaign_id, 'coachCardEligible', v_now_eligible);
end;
$$;
alter function public.mark_squad_invite_participation_paid(uuid) owner to postgres;
revoke all on function public.mark_squad_invite_participation_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_squad_invite_participation_paid(uuid) to service_role;

-- Organiser submission. design is server-derived, never organiser-typed —
-- Squad Invite has no per-campaign template gallery the way the legacy
-- full-squad builder's own coach-card step does (see coach-card-draft.ts's
-- coachCardDesignInheritance: inherited from the team's existing template,
-- never customer-entered). Rejects outright if not yet eligible, or if
-- already locked — a locked coach card can only be reopened by staff via
-- review_squad_invite_coach_card('request_changes', ...) below, never by
-- the organiser resubmitting directly.
create or replace function public.submit_squad_invite_coach_card(p_campaign_id uuid, p_full_name text, p_role_title text, p_photo_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.squad_invites%rowtype;
  v_existing public.squad_invite_coach_cards%rowtype;
  v_full_name text := trim(p_full_name);
  v_role_title text := trim(p_role_title);
begin
  select * into v_campaign from public.squad_invites where id = p_campaign_id for update;
  if not found then raise exception 'campaign not found'; end if;
  if not v_campaign.coach_card_eligible then raise exception 'campaign is not eligible for a coach card'; end if;
  if char_length(v_full_name) < 2 or char_length(v_full_name) > 120 then raise exception 'full name must be between 2 and 120 characters'; end if;
  if char_length(v_role_title) < 2 or char_length(v_role_title) > 80 then raise exception 'role title must be between 2 and 80 characters'; end if;
  if p_photo_key is null or char_length(trim(p_photo_key)) = 0 then raise exception 'a coach photo is required'; end if;

  select * into v_existing from public.squad_invite_coach_cards where campaign_id = p_campaign_id;
  if found and v_existing.configuration_status = 'locked' then
    raise exception 'this coach card has already been locked for production';
  end if;

  insert into public.squad_invite_coach_cards(campaign_id, full_name, role_title, photo_key, design, configuration_status, production_eligible, configured_at)
  values (p_campaign_id, v_full_name, v_role_title, p_photo_key, jsonb_build_object('inheritedFrom', 'squad_invite_campaign_default', 'clubTeamName', v_campaign.club_team_name), 'submitted', v_campaign.coach_card_eligible, now())
  on conflict (campaign_id) do update set
    full_name = excluded.full_name, role_title = excluded.role_title, photo_key = excluded.photo_key,
    design = excluded.design, configuration_status = 'submitted', production_eligible = excluded.production_eligible,
    configured_at = now(), locked_at = null;

  insert into public.squad_invite_audit_events(campaign_id, actor_role, event_type, metadata)
  values (p_campaign_id, 'organiser', 'coach_card_submitted', jsonb_build_object('fullName', v_full_name, 'roleTitle', v_role_title));

  return jsonb_build_object('configurationStatus', 'submitted');
end;
$$;
alter function public.submit_squad_invite_coach_card(uuid,text,text,text) owner to postgres;
revoke all on function public.submit_squad_invite_coach_card(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_squad_invite_coach_card(uuid,text,text,text) to service_role;

-- Staff review — mirrors review_squad_invite_request's lock/send-back shape
-- (0052) rather than a one-way approval. 'lock' freezes the submission for
-- production; 'request_changes' reopens it (back to 'draft') with a
-- required organiser-visible reason, same as request_changes on the main
-- request review flow.
create or replace function public.review_squad_invite_coach_card(p_campaign_id uuid, p_action text, p_staff_profile_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_card public.squad_invite_coach_cards%rowtype;
begin
  if p_action not in ('lock','request_changes') then raise exception 'invalid action'; end if;
  select * into v_card from public.squad_invite_coach_cards where campaign_id = p_campaign_id for update;
  if not found then raise exception 'no coach card submission exists for this campaign'; end if;
  if v_card.configuration_status <> 'submitted' then raise exception 'coach card is not awaiting review'; end if;

  if p_action = 'lock' then
    update public.squad_invite_coach_cards set configuration_status = 'locked', locked_at = now() where campaign_id = p_campaign_id;
    insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
    values (p_campaign_id, p_staff_profile_id, 'staff', 'coach_card_locked', '{}'::jsonb);
    return jsonb_build_object('configurationStatus', 'locked');
  end if;

  if p_reason is null or char_length(trim(p_reason)) = 0 then raise exception 'a reason is required to request changes'; end if;
  update public.squad_invite_coach_cards set configuration_status = 'draft' where campaign_id = p_campaign_id;
  insert into public.squad_invite_audit_events(campaign_id, actor_profile_id, actor_role, event_type, metadata)
  values (p_campaign_id, p_staff_profile_id, 'staff', 'coach_card_changes_requested', jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('configurationStatus', 'draft');
end;
$$;
alter function public.review_squad_invite_coach_card(uuid,text,uuid,text) owner to postgres;
revoke all on function public.review_squad_invite_coach_card(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.review_squad_invite_coach_card(uuid,text,uuid,text) to service_role;

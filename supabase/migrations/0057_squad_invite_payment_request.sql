-- Purpose: atomically issues a payment request for one Squad Invite
-- participation, once its campaign's pricing has been finalised. Every
-- other Squad Invite state transition in this schema goes through a
-- security definer RPC rather than a raw table update — this one needs it
-- more than most, since squad_invite_participations couples status,
-- payment_request_status, payment_request_issued_at and payment_deadline_at
-- together (the latter is locked to exactly issued_at + 72 hours by the
-- existing squad_invite_payment_window_coherent constraint), so a plain
-- .update() from application code risks writing an inconsistent row.
--
-- Deliberately participation-level, not campaign-wide: the caller (the
-- finalise-pricing route) loops over each eligible participation and calls
-- this once per parent, since each one needs its own payment link and its
-- own 72-hour window starting from when THEIR request was issued.
--
-- Refuses to run before pricing_finalised_at is set — the final unit price
-- this returns is what the caller's payment link must actually charge, and
-- that price does not exist before finalisation.

-- The starting array here is the live constraint as it actually exists
-- today (verified via pg_get_constraintdef against the disposable project,
-- not just the original 0050 migration file — a later migration already
-- widened it further with delivery_setup_completed/campaign_activated/
-- approval_cancelled/notification_resend_prepared, none of which appear
-- in 0050 itself). Only 'payment_requested' is new here.
alter table public.squad_invite_audit_events
  drop constraint squad_invite_audit_events_event_type_check,
  add constraint squad_invite_audit_events_event_type_check
    check (event_type = any (array[
      'campaign_created','approval_requested','campaign_approved','campaign_published','invitation_opened',
      'builder_started','commitment_completed','pricing_finalised','payment_request_reissued',
      'payment_confirmed','payment_exception','campaign_closed','campaign_cancelled','coach_card_unlocked',
      'fulfilment_started','fulfilment_transitioned','organiser_reassigned','support_requested','staff_override',
      'delivery_setup_completed','campaign_activated','approval_cancelled','notification_resend_prepared',
      'payment_requested'
    ]));

create or replace function public.issue_squad_invite_payment_request(p_participation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_campaign public.squad_invites%rowtype;
begin
  select * into v_participation from public.squad_invite_participations where id = p_participation_id for update;
  if not found then raise exception 'participation not found'; end if;
  if v_participation.status not in ('commitment_completed','payment_request_pending') then
    raise exception 'participation is not eligible for a payment request';
  end if;
  select * into v_campaign from public.squad_invites where id = v_participation.campaign_id for update;
  if not found or v_campaign.pricing_finalised_at is null or v_campaign.final_unit_price_pence is null then
    raise exception 'campaign pricing has not been finalised';
  end if;
  update public.squad_invite_participations set
    status = 'payment_requested',
    payment_request_status = 'issued',
    payment_request_issued_at = now(),
    payment_deadline_at = now() + interval '72 hours',
    updated_at = now()
  where id = p_participation_id;
  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_role, event_type, metadata)
  values (v_participation.campaign_id, p_participation_id, 'system', 'payment_requested',
    jsonb_build_object('finalUnitPricePence', v_campaign.final_unit_price_pence, 'finalTier', v_campaign.final_tier));
  return jsonb_build_object(
    'ok', true, 'orderId', v_participation.order_id,
    'printQuantity', v_participation.print_quantity,
    'finalUnitPricePence', v_campaign.final_unit_price_pence
  );
end;
$$;
alter function public.issue_squad_invite_payment_request(uuid) owner to postgres;
revoke all on function public.issue_squad_invite_payment_request(uuid) from public, anon, authenticated;
grant execute on function public.issue_squad_invite_payment_request(uuid) to service_role;

comment on function public.issue_squad_invite_payment_request(uuid) is
  'Locks in one participation''s 72-hour payment window and returns what its caller needs to build a payment link (order_id for order_ref lookup, print_quantity, the campaign''s already-finalised unit price). Never itself creates a Shopify link or sends anything — that is application-layer.';

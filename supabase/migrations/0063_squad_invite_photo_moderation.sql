-- Closes DPIA risk R12: a parent-uploaded child photo went straight from
-- upload to card_definitions.status='approved' (commit_squad_invite_
-- participation_order, 0055) with no human content-review step.
-- approveSquadInviteOrder (approve/route.ts) — the actual proceeds-to-
-- production gate — never reads or writes card_definitions at all; it
-- only flips orders.payment_status. Staff can already see the raw photo
-- in the Awaiting Approval queue (designPreview.photoUrl) but have no
-- action to reject it on content grounds. This adds that action, gated
-- on the same generic requireStaff tier as order approval itself — no
-- new permission concept, matching the confirmed decision for this pilot.
--
-- Both starting arrays below are the live constraints exactly as they
-- exist today (verified via pg_get_constraintdef against the disposable
-- project — no drift from migration history).
alter table public.card_definitions
  drop constraint card_definitions_status_check,
  add constraint card_definitions_status_check
    check (status in ('draft', 'approved', 'rejected'));

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
      'photo_rejected'
    ]));

-- Whole-order reject, not per-child: a team order can have several
-- card_definitions rows (one per player), but the existing preview this
-- action is reviewed from (getDesignPreviewsByOrder, staff/queue/page.tsx)
-- already only surfaces one photo per order ("one preview per order —
-- first match only") — this doesn't distinguish individual children
-- either, so rejecting the whole order's photos matches that existing
-- limitation rather than introducing a new one. No in-app reshoot flow —
-- staff already have purchaser_email and follow up manually, same as
-- every other "staff decides manually" action in this pilot.
create or replace function public.reject_squad_invite_card_photo(p_order_id uuid, p_staff_profile_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participation public.squad_invite_participations%rowtype;
  v_order public.orders%rowtype;
  v_rejected_count integer;
begin
  select * into v_participation from public.squad_invite_participations where order_id = p_order_id;
  if not found then
    raise exception 'this order is not linked to a Squad Invite participation';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.payment_status = 'fulfilled' then
    raise exception 'this order has already been approved for production — too late to reject the photo';
  end if;

  update public.card_definitions set status = 'rejected' where order_id = p_order_id;
  get diagnostics v_rejected_count = row_count;
  if v_rejected_count = 0 then
    raise exception 'no card photo found for this order';
  end if;

  insert into public.squad_invite_audit_events(campaign_id, participation_id, actor_profile_id, actor_role, event_type, metadata)
  values (v_participation.campaign_id, v_participation.id, p_staff_profile_id, 'staff', 'photo_rejected', jsonb_build_object('reason', p_reason));

  return jsonb_build_object('status', 'rejected', 'cardCount', v_rejected_count);
end;
$$;
alter function public.reject_squad_invite_card_photo(uuid,uuid,text) owner to postgres;
revoke all on function public.reject_squad_invite_card_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reject_squad_invite_card_photo(uuid,uuid,text) to service_role;

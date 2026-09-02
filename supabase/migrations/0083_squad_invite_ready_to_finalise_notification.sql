-- A 13th real staff-attention trigger, found after 0082 shipped: a campaign
-- becoming ready for staff to finalise pricing (its grace period lapsing,
-- or the organiser closing it early — see finalise_squad_invite_pricing's
-- own gate in 0050/0066) is a time-based state change, not a database
-- write. Nothing *happens* at that moment; time just passes. Like
-- squad_invite_payments_overdue, this can only be detected by a periodic
-- sweep, which is why the original write-triggered audit behind 0082
-- missed it. Adds the one new event_type value this needs; the outbox
-- table, RPC, dispatcher, and email template from 0082 are all reused
-- unchanged.

begin;

-- Look up the check constraint by its definition rather than assuming
-- Postgres's default auto-generated name, so this migration can't fail on
-- a naming-convention mismatch.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.staff_notification_outbox'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%event_type%';

  if v_constraint_name is null then
    raise exception 'staff_notification_outbox event_type check constraint not found';
  end if;

  execute format('alter table public.staff_notification_outbox drop constraint %I', v_constraint_name);
end $$;

alter table public.staff_notification_outbox add constraint staff_notification_outbox_event_type_check check (event_type in (
  'new_squad_invite_request',
  'deletion_request_filed',
  'auth_deletion_stuck',
  'new_order_pending_approval',
  'payment_verification_failed',
  'finalise_pricing_issues',
  'organiser_concern_flagged',
  'coach_card_submitted',
  'squad_invite_payments_overdue',
  'organiser_notification_failed',
  'upload_sweep_errors',
  'squad_invite_ready_to_finalise'
));

commit;

-- Every existing outbox in this codebase (squad_invite_notification_outbox,
-- 0052) notifies organisers/parents — there is no staff-facing notification
-- channel anywhere. A full audit this session found 12 real "something
-- needs a staff member's attention" moments that are currently pure-pull:
-- a human has to already be on the right page (sometimes inside a
-- collapsed accordion) to ever discover them. The highest-stakes of these
-- (a Shopify payment webhook that fails verification) is currently
-- console.error-only — real money, invisible outside raw server logs.
--
-- This migration adds one generic outbox table + one enqueue RPC, reused
-- across all 12 trigger points rather than a bespoke table per event type.
-- Deliberately one row per EVENT, not per recipient — at this team's size a
-- single email with multiple resolved recipients is simpler than a fan-out
-- table, and nobody needs per-recipient delivery tracking yet.

begin;

create table public.staff_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
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
    'upload_sweep_errors'
  )),
  -- The idempotency key — e.g. 'deletion_request_filed:<request_id>', or a
  -- date-scoped key for cron-detected events like
  -- 'upload_sweep_errors:2026-09-01'. A unique-constraint conflict on
  -- enqueue is a safe no-op, same pattern squad_invite_notification_outbox
  -- already established for its own (request_id, event_key) uniqueness.
  event_key text not null unique,
  -- Traceability only (which order/request/campaign this was about) —
  -- never joined back to for the email body itself; every field the email
  -- actually shows lives in `summary` below, resolved once at enqueue
  -- time by the caller who already has the context, not re-derived here.
  subject_id uuid,
  recipient_scope text not null check (recipient_scope in ('all_staff', 'squad_invite_reviewer', 'squad_invite_approver')),
  -- Minimal, safe context only (team name, reference code, counts) —
  -- never child PII, matching squad_invite_notification_outbox's own
  -- "Raw credentials, delivery addresses and child data are prohibited"
  -- convention on its table comment.
  summary jsonb not null default '{}'::jsonb,
  -- A relative path into the staff app (e.g. '/staff/squad-invites/SI-ABCD1234EF')
  -- built server-side by the caller — never a client-supplied URL.
  link_path text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

comment on table public.staff_notification_outbox is
  'Generic outbox for every "a staff member needs to know this happened" email in the app. One row per event (not per recipient) — recipients are resolved fresh at dispatch time from staff_accounts/squad_invite_staff_permissions, never stored here. Never child PII in `summary` — team names, reference codes, and counts only.';

create index staff_notification_outbox_status_idx on public.staff_notification_outbox(status) where status <> 'sent';

alter table public.staff_notification_outbox enable row level security;
-- No policies — service-role only, same default-deny pattern as every
-- other audit/outbox table in this codebase.
revoke all on public.staff_notification_outbox from public, anon, authenticated;
grant select, insert, update on public.staff_notification_outbox to service_role;

create or replace function public.enqueue_staff_notification(
  p_event_type text,
  p_event_key text,
  p_subject_id uuid,
  p_recipient_scope text,
  p_summary jsonb,
  p_link_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.staff_notification_outbox (event_type, event_key, subject_id, recipient_scope, summary, link_path)
  values (p_event_type, p_event_key, p_subject_id, p_recipient_scope, coalesce(p_summary, '{}'::jsonb), p_link_path)
  on conflict (event_key) do nothing
  returning id into v_id;

  -- A conflict means this exact event was already enqueued (e.g. a retried
  -- request-handler, or a repeat call for an already-idempotent underlying
  -- RPC like request_player_deletion) — the caller's dispatch step is a
  -- no-op when this returns null, never a second send for the same event.
  return v_id;
end;
$$;

alter function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) owner to postgres;
revoke all on function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) to service_role;

comment on function public.enqueue_staff_notification(text, text, uuid, text, jsonb, text) is
  'The one write path onto staff_notification_outbox. Idempotent via the event_key unique constraint — returns null (not the existing row''s id) on a conflict, so callers can tell "already enqueued, skip dispatch" apart from "newly enqueued, dispatch it" without a second lookup.';

commit;

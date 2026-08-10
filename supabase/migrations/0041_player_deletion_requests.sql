-- "Request player-data deletion" (Account Settings MVP) — a reviewable
-- operational request, not immediate self-serve deletion. Confirmed with
-- the product owner: the FK graph shows immediate deletion is technically
-- safe end-to-end (no NO ACTION FK blocks it; cards/card_definitions
-- survive with player_id set null, matching
-- docs/pilot/child-data-deletion-runbook.md's existing staff-executed
-- process exactly) — the gap isn't safety, it's this being the first time
-- a guardian could trigger it themselves with no human review. This table
-- is a plain request/audit record, not a job/outbox queue — no retry or
-- worker semantics, just something a staff member reviews and then
-- executes via the existing runbook.
create table player_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  requested_by uuid references profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  -- 'rejected' (staff reviewed and declined to act — e.g. couldn't verify
  -- identity) and 'cancelled' (the guardian withdrew it) are deliberately
  -- distinct from 'completed' — pressing "Mark completed" must never be
  -- the only record of what actually happened to a request.
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  notes text,
  -- The completion acknowledgement — who confirmed the runbook was
  -- actually carried out, when, and their own note. All three are
  -- required together whenever status = 'completed' (enforced below, not
  -- just in the UI) — "Mark completed" must never be a single click with
  -- no record of who attested to it or why.
  completed_by uuid references profiles (id) on delete set null,
  completed_at timestamptz,
  completion_note text,
  -- Staff decline (never a deletion) and guardian withdrawal — the other
  -- two ways a 'pending' request can end besides completion. Same
  -- required-together-with-status shape as completed_by/at/note above.
  handled_by uuid references profiles (id) on delete set null,
  handled_at timestamptz,
  rejection_reason text,
  cancelled_by uuid references profiles (id) on delete set null,
  cancelled_at timestamptz,
  constraint player_deletion_requests_completion_requires_attestation check (
    status <> 'completed'
    or (completed_by is not null and completed_at is not null and completion_note is not null and length(trim(completion_note)) > 0)
  ),
  constraint player_deletion_requests_rejection_requires_reason check (
    status <> 'rejected'
    or (handled_by is not null and handled_at is not null and rejection_reason is not null and length(trim(rejection_reason)) > 0)
  ),
  constraint player_deletion_requests_cancellation_requires_actor check (
    status <> 'cancelled'
    or (cancelled_by is not null and cancelled_at is not null)
  )
);

alter table player_deletion_requests enable row level security;

create policy "player_deletion_requests: guardians can view their own requests"
  on player_deletion_requests for select
  using (
    exists (
      select 1 from guardians g
      where g.player_id = player_deletion_requests.player_id and g.profile_id = auth.uid()
    )
  );

grant select on player_deletion_requests to authenticated;
-- No insert/update/delete grant for authenticated — every write goes
-- through request_player_deletion below (guardian-facing) or staff
-- tooling later (marking a request completed/declined once the runbook
-- has been carried out) — not built in this pass.

create index idx_player_deletion_requests_player on player_deletion_requests (player_id, status);

-- Guardian-callable directly (Account Settings' own "Request deletion"
-- action) and internally by delete_own_guardian_account (0042) for a
-- sole-guarded player. Idempotent: a second call while a pending request
-- already exists returns the existing request's id rather than creating
-- a duplicate — covers duplicate taps without needing client-side-only
-- debouncing to be the only safeguard.
create or replace function public.request_player_deletion(p_player_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to request deletion for this player';
  end if;

  select id into v_request_id
  from public.player_deletion_requests
  where player_id = p_player_id and status = 'pending'
  limit 1;

  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.player_deletion_requests (player_id, requested_by, notes)
  values (p_player_id, auth.uid(), p_notes)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_player_deletion(uuid, text) from public;
revoke all on function public.request_player_deletion(uuid, text) from anon;
grant execute on function public.request_player_deletion(uuid, text) to authenticated;

-- Real state-machine enforcement, not just disabled buttons: once a
-- request leaves 'pending' it can never move again, regardless of which
-- code path attempts it — a guardian's RPC below, a staff route's plain
-- service-role UPDATE (service_role has no RLS to stop it), or a direct
-- SQL statement run by hand. Same-status no-op updates (e.g. re-writing a
-- column on an already-rejected row without changing status) are still
-- allowed; only an actual status change away from a terminal state raises.
create or replace function public.enforce_player_deletion_request_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.status in ('completed', 'rejected', 'cancelled') and NEW.status is distinct from OLD.status then
    raise exception 'Cannot change the status of a % request', OLD.status;
  end if;
  return NEW;
end;
$$;

create trigger player_deletion_requests_enforce_transition
  before update on player_deletion_requests
  for each row execute function public.enforce_player_deletion_request_transition();

-- Guardian-callable withdrawal — Account Settings' own "Cancel deletion
-- request" action. Same ownership check as request_player_deletion, and
-- the same idempotent shape: cancelling an already-cancelled request is a
-- safe no-op (returns true without rewriting cancelled_by/at), while
-- cancelling a completed or rejected request is a real error — those are
-- a genuinely different outcome, not a duplicate of this action.
--
-- Always looks at the single most recent request for this player,
-- regardless of its status, before deciding what to do with it — not
-- "the most recent pending-or-cancelled one". A player can accumulate
-- several historical rows over time (a prior request rejected, then a new
-- one filed later); filtering by status before picking "most recent"
-- would let this function reach past a newer completed/rejected row and
-- silently no-op against a stale older cancelled one instead of correctly
-- refusing. Only ever moves 'pending' -> 'cancelled'; the trigger above
-- is the backstop if this check is ever bypassed.
create or replace function public.cancel_own_player_deletion_request(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
  v_request_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.guardians g
    where g.player_id = p_player_id and g.profile_id = auth.uid()
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to cancel a deletion request for this player';
  end if;

  select id, status into v_request_id, v_status
  from public.player_deletion_requests
  where player_id = p_player_id
  order by requested_at desc
  limit 1;

  if v_request_id is null or v_status not in ('pending', 'cancelled') then
    raise exception 'No cancellable deletion request found for this player';
  end if;

  if v_status = 'cancelled' then
    return true;
  end if;

  update public.player_deletion_requests
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_request_id;

  return true;
end;
$$;

revoke all on function public.cancel_own_player_deletion_request(uuid) from public;
revoke all on function public.cancel_own_player_deletion_request(uuid) from anon;
grant execute on function public.cancel_own_player_deletion_request(uuid) to authenticated;

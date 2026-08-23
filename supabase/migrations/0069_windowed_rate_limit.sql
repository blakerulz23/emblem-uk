-- Gate 1 closure pass — a caller-specified-window sibling to
-- consume_squad_invite_rate_limit (migration 0051), which is NOT touched
-- by this migration: its window is hardcoded to a fixed 5 minutes
-- (v_window := date_trunc('hour', now()) + floor(minute/5)*5min),
-- computed server-side regardless of the bucket hash passed in, so it
-- cannot express a genuinely longer rolling window or a daily ceiling no
-- matter what key a caller supplies.
--
-- Reuses the EXISTING public.squad_invite_rate_limits table rather than
-- creating a new one — its schema (bucket_hash / window_started_at /
-- attempt_count, primary key on the pair) is already fully generic, not
-- Squad-Invite-specific in structure, and its RLS/grant posture already
-- fits (service_role only, enabled in migration 0051). Reused deliberately
-- because its semantics (opaque HMAC bucket, fixed-size time-bucketed
-- counter, no raw IP ever stored) are exactly what a burst+rolling-window
-- issuance limiter needs — not because the name happened to be
-- convenient.
--
-- Used by src/lib/anonymous-request-rate-limit.ts for
-- POST /api/builder-submissions' issuance limiter (burst + rolling-window
-- + daily-ceiling tiers, all IP-keyed — see that file for why issuance
-- itself, not just the capabilities it produces, needs its own limit).
create or replace function public.consume_windowed_rate_limit(
  p_bucket_hash text,
  p_limit integer,
  p_window_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_bucket_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_window_minutes < 1 or p_window_minutes > 1440 then
    return false;
  end if;
  -- Floors the current time to a fixed-size window of p_window_minutes,
  -- anchored at the Unix epoch — the same "which N-minute slot are we in"
  -- idea as 0051's own hardcoded 5-minute version, just parameterised.
  v_window := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));
  insert into public.squad_invite_rate_limits(bucket_hash, window_started_at, attempt_count)
    values (p_bucket_hash, v_window, 1)
    on conflict (bucket_hash, window_started_at) do update set attempt_count = public.squad_invite_rate_limits.attempt_count + 1
    returning attempt_count into v_count;
  return v_count <= p_limit;
end;
$$;

alter function public.consume_windowed_rate_limit(text, integer, integer) owner to postgres;
revoke all on function public.consume_windowed_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_windowed_rate_limit(text, integer, integer) to service_role;

comment on function public.consume_windowed_rate_limit is 'Caller-specified-window rate limiter reusing squad_invite_rate_limits'' existing generic schema — see migration 0069''s own header comment for why consume_squad_invite_rate_limit (fixed 5-minute window) is not touched or reused directly for this.';

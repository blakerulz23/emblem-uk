-- Closes the gap found during the Gate 2 background-removal/authority
-- review: the ordinary (non-Squad-Invite) direct/team builder had no age,
-- parental-responsibility, or authority confirmation of any kind — Squad
-- Invite already has this machinery (0050 onward), this migration brings
-- an equivalent, deliberately compact version to the ordinary builder
-- without touching a single Squad Invite table, function or grant.
--
-- Three new tables, additive only, no existing table is altered except
-- `orders` gaining one new nullable column with no default — every
-- historical row and every Squad Invite order keeps reading back
-- unaffected, exactly 0045/0048's own established pattern for this.

-- ---------------------------------------------------------------------------
-- orders.authority_status — a separate axis from payment_status, same
-- reasoning Squad Invite already established for keeping its own
-- participation status distinct from payment_status: these are genuinely
-- different concepts and conflating them would make both harder to reason
-- about. NULL for every historical order and every Squad Invite order
-- (source='squad_invite'), which already enforces its own authority
-- machinery independently and is never touched by the constraint below.
-- ---------------------------------------------------------------------------
alter table orders add column authority_status text;
alter table orders add constraint orders_authority_status_check
  check (authority_status is null or authority_status in (
    'confirmed', 'guardian_approval_pending', 'guardian_approved', 'guardian_declined'
  ));

comment on column orders.authority_status is
  'Ordinary-builder authority/consent gate (migration 0071) — NULL for historical orders and all Squad Invite orders, which enforce authority separately. confirmed: a parent/legal guardian completed the Adult Permission step directly. guardian_approval_pending/guardian_approved/guardian_declined: a non-guardian adult (coach/organiser/other) submitted the order, and a separate guardian must approve before staff can ever fulfil it — see builder_guardian_approval_requests.';

-- ---------------------------------------------------------------------------
-- builder_order_authority_declarations — one row per builder submission's
-- Adult Permission step, keyed by the SAME submission_key the builder
-- capability system (0068) already uses as its idempotency identity for
-- that exact session. Recorded BEFORE the order exists (the Adult
-- Permission step is the last builder step before the final submit call),
-- then linked to the real order_id by link_builder_order_authority once
-- create_authoritative_order (0048, UNCHANGED by this migration) has run.
-- ---------------------------------------------------------------------------
create table builder_order_authority_declarations (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid not null unique,
  order_id uuid references orders(id) on delete set null,
  adult_user_id uuid not null,
  adult_email text not null,
  relationship text not null check (relationship in ('parent_guardian', 'coach', 'club_organiser', 'other_adult')),
  declaration_version text not null,
  confirmed_age_and_authority boolean not null,
  confirmed_photo_permission boolean not null,
  confirmed_card_creation boolean not null,
  created_at timestamptz not null default now()
);

comment on table builder_order_authority_declarations is
  'One row per Adult Permission step completion. All three confirmation booleans must be true before this row can be written at all (enforced in record_builder_authority_declaration, not just trusted from the client) — this table never stores a false/unticked confirmation as evidence of anything.';
comment on column builder_order_authority_declarations.adult_user_id is
  'auth.uid() of the Supabase Auth session established by builder-authority OTP verification — proves control of adult_email at declaration time, same trust model as every other guardian-email verification in this codebase.';

create index builder_order_authority_declarations_order_id_idx on builder_order_authority_declarations(order_id);

alter table builder_order_authority_declarations enable row level security;
-- No policies — service-role only, same deliberate default-deny pattern
-- as squad_invite_participations and the 0068/0070 capability tables.
-- Nothing here is ever read directly by an authenticated client; every
-- access goes through the RPCs below.
revoke all on builder_order_authority_declarations from public, anon, authenticated;
grant select, insert, update on builder_order_authority_declarations to service_role;

-- ---------------------------------------------------------------------------
-- builder_guardian_approval_requests — the async path for a coach/
-- organiser/other-adult submission. High-entropy token, stored only as a
-- hash (same discipline as Squad Invite's own reusable invitation link,
-- see 0050's own comment for why: the raw credential is shown/emailed
-- once, the database never holds anything an attacker could replay from a
-- leaked row).
-- ---------------------------------------------------------------------------
create table builder_guardian_approval_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  guardian_email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired', 'revoked')),
  declaration_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  revoked_by uuid references auth.users(id)
);

comment on table builder_guardian_approval_requests is
  'One row per guardian-approval request, created by create_builder_guardian_approval_request once the guardian''s real email is known (link_builder_order_authority only flips the order to guardian_approval_pending — it never creates this row, since the real email is not yet known at that point in the flow). The raw token is emailed to guardian_email once; only its hash is ever stored. A staff member may set status=revoked directly (no dedicated RPC required for that narrow, rare action — see the Gate 2 report for why this is deliberately scoped down); approve/decline is exclusively via respond_to_builder_guardian_approval, which requires the raw token.';

create index builder_guardian_approval_requests_order_id_idx on builder_guardian_approval_requests(order_id);
create index builder_guardian_approval_requests_status_idx on builder_guardian_approval_requests(status) where status = 'pending';

alter table builder_guardian_approval_requests enable row level security;
revoke all on builder_guardian_approval_requests from public, anon, authenticated;
grant select, insert, update on builder_guardian_approval_requests to service_role;

-- ---------------------------------------------------------------------------
-- builder_authority_audit_events — immutable-by-convention audit trail,
-- same shape as squad_invite_audit_events (0050): fixed event_type
-- vocabulary, service-role-only, RLS enabled with zero policies. No
-- update/delete grant is given to any role including service_role for
-- ordinary application code paths — see the "no update path" note below.
-- ---------------------------------------------------------------------------
create table builder_authority_audit_events (
  id uuid primary key default gen_random_uuid(),
  submission_key uuid,
  order_id uuid references orders(id) on delete set null,
  event_type text not null check (event_type in (
    'declaration_recorded', 'authority_linked_confirmed', 'authority_linked_pending',
    'guardian_request_created', 'guardian_approved', 'guardian_declined',
    'guardian_request_expired', 'guardian_request_revoked', 'staff_approval_blocked'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table builder_authority_audit_events is
  'Append-only. metadata never contains the child''s name, photo, or any other deleted-on-request personal data — only the fact and shape of the authority event, same discipline the child-data deletion runbook already requires of every audit record in this codebase. No UPDATE or DELETE grant exists on this table for any role — rows are corrected by inserting a new event, never by mutating history.';

create index builder_authority_audit_events_order_id_idx on builder_authority_audit_events(order_id);

alter table builder_authority_audit_events enable row level security;
revoke all on builder_authority_audit_events from public, anon, authenticated;
-- Deliberately INSERT-only for service_role — no update/delete grant at
-- all, on any role, including service_role: the only way to add a row is
-- INSERT, so "immutable" is a real property of the grants, not just a
-- comment's promise.
grant select, insert on builder_authority_audit_events to service_role;

-- ---------------------------------------------------------------------------
-- record_builder_authority_declaration — called once the Adult Permission
-- step's OTP verification has established a real Supabase Auth session for
-- the adult's email. Requires auth.uid() (an authenticated session), not a
-- service-role-only call — this is the one RPC in this migration that an
-- ordinary `authenticated` client calls directly, exactly mirroring how
-- Squad Invite's own commit_squad_invite_participation_order re-derives
-- identity from the authenticated caller rather than trusting a client-
-- supplied id (0055's own header comment).
-- ---------------------------------------------------------------------------
create or replace function public.record_builder_authority_declaration(
  p_submission_key uuid,
  p_relationship text,
  p_declaration_version text,
  p_confirmed_age_and_authority boolean,
  p_confirmed_photo_permission boolean,
  p_confirmed_card_creation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_submission_key is null then
    raise exception 'submission_key is required';
  end if;
  if p_relationship is null or p_relationship not in ('parent_guardian', 'coach', 'club_organiser', 'other_adult') then
    raise exception 'invalid relationship';
  end if;
  if p_declaration_version is null or length(trim(p_declaration_version)) = 0 then
    raise exception 'declaration_version is required';
  end if;
  -- All three confirmations must be explicitly true — a false or missing
  -- value here is rejected outright, never silently recorded as a
  -- declaration. This is the actual enforcement point; the client-side
  -- unticked-by-default checkboxes are UX, not the security boundary.
  if not (p_confirmed_age_and_authority and p_confirmed_photo_permission and p_confirmed_card_creation) then
    raise exception 'all three confirmations are required';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'could not resolve verified email for this session';
  end if;

  insert into public.builder_order_authority_declarations (
    submission_key, adult_user_id, adult_email, relationship, declaration_version,
    confirmed_age_and_authority, confirmed_photo_permission, confirmed_card_creation
  ) values (
    p_submission_key, auth.uid(), lower(trim(v_email)), p_relationship, p_declaration_version,
    p_confirmed_age_and_authority, p_confirmed_photo_permission, p_confirmed_card_creation
  )
  on conflict (submission_key) do update set
    adult_user_id = excluded.adult_user_id,
    adult_email = excluded.adult_email,
    relationship = excluded.relationship,
    declaration_version = excluded.declaration_version,
    confirmed_age_and_authority = excluded.confirmed_age_and_authority,
    confirmed_photo_permission = excluded.confirmed_photo_permission,
    confirmed_card_creation = excluded.confirmed_card_creation,
    created_at = now()
  returning id into v_id;

  insert into public.builder_authority_audit_events (submission_key, event_type, metadata)
  values (p_submission_key, 'declaration_recorded', jsonb_build_object('relationship', p_relationship));

  return jsonb_build_object('ok', true, 'relationship', p_relationship);
end;
$$;

revoke all on function public.record_builder_authority_declaration(uuid, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.record_builder_authority_declaration(uuid, text, text, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- link_builder_order_authority — service-role only, called from
-- POST /api/order-enquiry immediately after create_authoritative_order
-- (0048, unmodified) succeeds. Looks up the declaration recorded above by
-- submission_key, links it to the real order_id, and sets
-- orders.authority_status.
--
-- For a non-guardian relationship this only flips the order into
-- guardian_approval_pending — it does not create a guardian_approval_requests
-- row or touch any token, because the real guardian email is not yet known
-- at this point in the flow (the user has not reached the guardian-pending
-- screen yet). See create_builder_guardian_approval_request below for the
-- single point where a token is generated and hashed, once that email is
-- known.
-- ---------------------------------------------------------------------------
create or replace function public.link_builder_order_authority(
  p_order_id uuid,
  p_submission_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_declaration record;
begin
  if p_order_id is null or p_submission_key is null then
    raise exception 'order_id and submission_key are required';
  end if;

  select * into v_declaration
  from public.builder_order_authority_declarations
  where submission_key = p_submission_key;

  if v_declaration is null then
    raise exception 'no authority declaration found for this submission';
  end if;

  update public.builder_order_authority_declarations
    set order_id = p_order_id
    where submission_key = p_submission_key;

  if v_declaration.relationship = 'parent_guardian' then
    update public.orders set authority_status = 'confirmed' where id = p_order_id;
    insert into public.builder_authority_audit_events (submission_key, order_id, event_type)
      values (p_submission_key, p_order_id, 'authority_linked_confirmed');
    return jsonb_build_object('authorityStatus', 'confirmed');
  end if;

  update public.orders set authority_status = 'guardian_approval_pending' where id = p_order_id;

  insert into public.builder_authority_audit_events (submission_key, order_id, event_type, metadata)
    values (p_submission_key, p_order_id, 'authority_linked_pending', jsonb_build_object('relationship', v_declaration.relationship));

  return jsonb_build_object('authorityStatus', 'guardian_approval_pending');
end;
$$;

revoke all on function public.link_builder_order_authority(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_builder_order_authority(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- create_builder_guardian_approval_request — the single point where a
-- guardian_approval_requests row is actually created, called once, from
-- the SAME request that generates the raw token and sends the email (the
-- calling route never holds a raw token across two separate HTTP
-- requests). Service-role only, narrowly scoped to an order that is
-- genuinely awaiting guardian approval and does not already have a
-- pending request (re-running this for the same order replaces the
-- previous pending request rather than creating a duplicate, so a user
-- who mistypes the guardian email and retries doesn't leave stale rows
-- behind).
--
-- Concurrency: this function is only ever transactional with respect to
-- Postgres itself, never with the email send that follows it in the
-- calling route (a DB transaction cannot be atomic with an external HTTP
-- call) — the calling route's own comment covers what happens when that
-- send fails. What this function DOES guarantee is that two concurrent
-- calls for the same order (a double-click, or a genuine retry racing an
-- in-flight first attempt) can never both leave a live pending row behind:
-- `select ... for update` below takes a row lock on the order for the
-- duration of the call, so a second concurrent call blocks until the
-- first commits, then runs its own revoke-then-insert against the
-- already-updated state — never interleaved with it. Without this lock,
-- two callers could each pass the revoke step before either had inserted,
-- leaving two simultaneously valid, uncontrolled tokens for one order.
-- ---------------------------------------------------------------------------
create or replace function public.create_builder_guardian_approval_request(
  p_order_id uuid,
  p_guardian_email text,
  p_token_hash text,
  p_declaration_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status text;
  v_id uuid;
begin
  if p_guardian_email is null or length(trim(p_guardian_email)) < 3 or position('@' in p_guardian_email) = 0 then
    raise exception 'a valid guardian email is required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'a valid token_hash is required';
  end if;

  select authority_status into v_order_status from public.orders where id = p_order_id for update;
  if v_order_status is distinct from 'guardian_approval_pending' then
    raise exception 'order is not awaiting guardian approval';
  end if;

  -- Superseding an existing pending request (a retry with a corrected
  -- email, or a legitimate resend after a failed email delivery)
  -- invalidates the old token outright rather than leaving two live
  -- tokens for the same order. Safe from races with a concurrent caller
  -- because of the row lock taken above — no other call for this same
  -- order_id can be executing this statement at the same time.
  update public.builder_guardian_approval_requests
    set status = 'revoked'
    where order_id = p_order_id and status = 'pending';

  insert into public.builder_guardian_approval_requests (
    order_id, guardian_email, token_hash, declaration_version, expires_at
  ) values (
    p_order_id, lower(trim(p_guardian_email)), p_token_hash, p_declaration_version, now() + interval '14 days'
  )
  returning id into v_id;

  insert into public.builder_authority_audit_events (order_id, event_type)
    values (p_order_id, 'guardian_request_created');

  return jsonb_build_object('ok', true, 'requestId', v_id);
end;
$$;

revoke all on function public.create_builder_guardian_approval_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_builder_guardian_approval_request(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- respond_to_builder_guardian_approval — the guardian's own click from the
-- emailed link. Requires the token's hash (computed by the calling route
-- from the raw token in the URL, same TypeScript-side hashing as every
-- other token lookup in this codebase — see card-lookup.ts /
-- resolve_squad_invite_link's own callers). An order id alone is never
-- sufficient to approve/decline production of a child's card. Rate-limited
-- and CSRF-checked at the route layer, same layered-defence pattern as
-- every other token-bearing action in this codebase.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_builder_guardian_approval(
  p_token_hash text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
begin
  if p_decision is null or p_decision not in ('approved', 'declined') then
    raise exception 'invalid decision';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    -- Generic failure, matching card-lookup.ts's own discipline of never
    -- distinguishing "wrong token" from "expired" from "already used" in
    -- a way that helps an attacker enumerate — see the unavailable-page
    -- requirement in the product spec.
    return jsonb_build_object('ok', false);
  end if;

  -- Row-locked so a double-click (or a guardian tapping Approve then
  -- Decline before the first response lands) can't race two concurrent
  -- calls past the pending check below and each apply their own decision —
  -- the second call blocks until the first commits, then sees the
  -- already-updated (no longer 'pending') row and returns ok:false, same
  -- as any other already-used token.
  select * into v_request
  from public.builder_guardian_approval_requests
  where token_hash = p_token_hash
  for update;

  if v_request is null then
    return jsonb_build_object('ok', false);
  end if;

  if v_request.status <> 'pending' or v_request.expires_at < now() then
    -- Same jsonb_build_object('ok', false) shape as the malformed-hash and
    -- unknown-token branches above — this used to also return the row's
    -- real status ('expired'/'revoked'/'approved'/'declined'), which let a
    -- caller with the RPC's raw return value distinguish "this token once
    -- existed" from "this token never existed", a minor existence oracle.
    -- The real status is still visible to staff via a direct row read
    -- (service-role only) — it is only withheld from this function's return
    -- value, which is what an untrusted caller ultimately sees.
    return jsonb_build_object('ok', false);
  end if;

  update public.builder_guardian_approval_requests
    set status = p_decision, responded_at = now()
    where id = v_request.id;

  update public.orders
    set authority_status = case when p_decision = 'approved' then 'guardian_approved' else 'guardian_declined' end
    where id = v_request.order_id;

  insert into public.builder_authority_audit_events (order_id, event_type)
    values (v_request.order_id, case when p_decision = 'approved' then 'guardian_approved' else 'guardian_declined' end);

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

revoke all on function public.respond_to_builder_guardian_approval(text, text) from public, anon, authenticated;
grant execute on function public.respond_to_builder_guardian_approval(text, text) to service_role;
comment on function public.respond_to_builder_guardian_approval is
  'p_token_hash is the SHA-256 hex hash of the raw token from the emailed link URL, computed by the calling route — never a raw token, never digest() called in SQL (this project avoids pgcrypto under search_path=''''). A declined decision permanently sets authority_status=guardian_declined — no code path anywhere in this codebase (including the staff order-approval route) may move an order out of that state. Staff review cannot override a guardian refusal; only a fresh, genuine guardian approval can, and that requires a new request/new token, never a status edit.';

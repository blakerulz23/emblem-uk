-- A real, time-limited public share page — a founder-approved, explicitly
-- risk-accepted extension of guardian card sharing (migrations 0078/0084).
--
-- Every prior card-share migration deliberately avoided this: 0078's own
-- header comment says "this package does not create, store, or ever
-- return the generated share image", and the product spec that shaped
-- 0078/0084 explicitly ruled out a public card page, a permanent card
-- URL, and reproducing the Doodles Toy Factory public-link model. The
-- founder asked for exactly that model anyway (a real per-card page,
-- shown to anyone with the link) after being told plainly what it means:
-- for up to 7 days, a specific child's actual card image is reachable by
-- anyone who has the link, not only the person the guardian sent it to —
-- and that showing it requires the server to hold a copy of the rendered
-- image for that window, not just render it transiently in the
-- guardian's own browser as every other part of this feature does.
--
-- What this migration does NOT relax: card_share_public_pages is created
-- only via create_card_share_public_page below, which re-runs
-- get_card_share_eligibility (0078/0084) itself — the exact same
-- authorization boundary as every other card-share write. A guardian who
-- is not eligible to share cannot create a public page, full stop. Once
-- created, a page is:
--   - unguessable: the token is 256 bits of randomness (two concatenated
--     gen_random_uuid() values, hex-decoded) — gen_random_uuid() rather
--     than pgcrypto's gen_random_bytes deliberately, for the same reason
--     0048/0049 already document: pgcrypto commonly lives outside the
--     empty search_path a security definer function requires here,
--     gen_random_uuid() is a core pg_catalog builtin that isn't;
--   - time-limited: expires_at is fixed at creation time (now() + 7 days),
--     never extended, never re-derived from a later call;
--   - re-checked on every read, not just at creation: get_card_share_
--     public_page (the read path) re-verifies both expiry AND the
--     linked card's current access_status on every single call — a card
--     suspended, revoked, or caught by a deletion request AFTER the page
--     was created stops resolving immediately, exactly like every other
--     card-share read path already does, never waiting for the 7-day
--     window to lapse on its own.
--
-- The stored image itself is the front-only capture already generated
-- client-side for the native-share/download step (never a second,
-- separately-rendered image) — uploaded by the calling API route, which
-- also re-verifies eligibility before ever calling this RPC. Cleanup
-- (deleting the S3 object once expires_at has passed) is a separate,
-- scheduled sweep — see sweep-expired-card-share-public-pages — not this
-- migration's job.

begin;

create table public.card_share_public_pages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  -- 64 lowercase hex chars = 256 bits of randomness from two concatenated
  -- gen_random_uuid() values — see this migration's own header comment
  -- for why gen_random_uuid() rather than pgcrypto's gen_random_bytes.
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  -- Traceability only — the actual per-request authorization decision is
  -- always re-derived fresh via get_card_share_eligibility/access_status,
  -- never read from this column.
  guardian_profile_id uuid not null,
  front_image_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.card_share_public_pages is
  'Founder-approved public share pages (see this migration''s own header). One row per created share link. token is the only thing that grants access to view it — unguessable, never derived from order_id/card_id/participation_id. Every read re-verifies expires_at and the linked card''s current access_status; this table alone is never sufficient to prove a page is still viewable.';

create index card_share_public_pages_token_idx on public.card_share_public_pages(token);
create index card_share_public_pages_expires_at_idx on public.card_share_public_pages(expires_at);

alter table public.card_share_public_pages enable row level security;
-- No policies — service-role only, same default-deny pattern as every
-- other table this feature uses. The public page/image routes are
-- unauthenticated at the HTTP layer but still go through the Next.js
-- server using the service-role client, never a direct client-side query.
revoke all on public.card_share_public_pages from public, anon, authenticated;
grant select, insert, delete on public.card_share_public_pages to service_role;

-- ----------------------------------------------------------------------------
-- create_card_share_public_page — the one write path. Re-runs the full
-- eligibility check itself; the calling route's own prior check (if any)
-- is never trusted. front_image_key must already reference an object the
-- calling route has itself uploaded — this function never touches S3.
-- ----------------------------------------------------------------------------
create or replace function public.create_card_share_public_page(
  p_order_id uuid,
  p_front_image_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility jsonb;
  v_card_id uuid;
  v_token text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_order_id is null then
    raise exception 'order_id is required';
  end if;
  if p_front_image_key is null or length(trim(p_front_image_key)) = 0 then
    raise exception 'front_image_key is required';
  end if;

  v_eligibility := public.get_card_share_eligibility(p_order_id);
  if (v_eligibility ->> 'eligible')::boolean is not true then
    raise exception 'Sharing is not available for this card';
  end if;

  v_card_id := (v_eligibility ->> 'cardId')::uuid;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at := now() + interval '7 days';

  insert into public.card_share_public_pages (order_id, card_id, token, guardian_profile_id, front_image_key, expires_at)
  values (p_order_id, v_card_id, v_token, auth.uid(), p_front_image_key, v_expires_at);

  return jsonb_build_object('token', v_token, 'expiresAt', v_expires_at);
end;
$$;

revoke all on function public.create_card_share_public_page(uuid, text) from public, anon;
grant execute on function public.create_card_share_public_page(uuid, text) to authenticated;

comment on function public.create_card_share_public_page(uuid, text) is
  'Re-runs get_card_share_eligibility itself before ever inserting — the calling route''s own prior eligibility check is never trusted. token is 256 bits of randomness from two gen_random_uuid() values, never derived from order_id/card_id.';

-- ----------------------------------------------------------------------------
-- get_card_share_public_page — the one read path, called server-side only
-- (the Next.js route uses the service-role client; this is never exposed
-- to anon/authenticated directly). Re-verifies expiry AND the linked
-- card's current access_status on every call — a page is never "valid
-- because it was valid when created".
-- ----------------------------------------------------------------------------
create or replace function public.get_card_share_public_page(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_page record;
  v_card record;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('available', false);
  end if;

  select * into v_page from public.card_share_public_pages where token = p_token;
  if v_page.id is null then
    return jsonb_build_object('available', false);
  end if;

  if v_page.expires_at <= now() then
    return jsonb_build_object('available', false);
  end if;

  select * into v_card from public.cards where id = v_page.card_id;
  if v_card.id is null or v_card.access_status is not null then
    -- Suspended, revoked, or (via 0076's side effect) a deletion request
    -- was filed after this page was created — stop resolving immediately,
    -- never wait out the remaining expiry window.
    return jsonb_build_object('available', false);
  end if;

  return jsonb_build_object('available', true, 'frontImageKey', v_page.front_image_key);
end;
$$;

revoke all on function public.get_card_share_public_page(text) from public, anon, authenticated;
grant execute on function public.get_card_share_public_page(text) to service_role;

comment on function public.get_card_share_public_page(text) is
  'Service-role only — the public page/image routes call this server-side, never exposed directly to a browser. Re-verifies expires_at and the linked card''s current access_status on every call; a suspended/revoked card stops resolving immediately regardless of remaining expiry window.';

commit;

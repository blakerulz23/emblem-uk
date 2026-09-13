-- Adds an optional back image to the public share page (0085) — closing a
-- universal Front/Back gap, not something specific to any one template
-- family: card_share_public_pages had only front_image_key, and both
-- create_card_share_public_page/get_card_share_public_page only ever
-- moved a single front image, by 0085's own explicit design ("The stored
-- image itself is the front-only capture... never a second, separately-
-- rendered image"). A recipient of a share link has therefore never been
-- able to see a shared card's back at all, for ANY template, regardless
-- of whether that template has a real approved back.
--
-- This migration only widens the existing capability additively:
--  - back_image_key is nullable — a template with no approved back (see
--    card-face-registry.ts's own hasApprovedBack) legitimately shares
--    with no back image, and existing rows (front-only, created before
--    this migration) remain valid with back_image_key null.
--  - create_card_share_public_page's new p_back_image_key parameter has a
--    default of null, so it remains callable exactly as before for any
--    caller that only ever sends a front image.
--  - Every existing authorization/expiry/access-status check is
--    reproduced byte-for-byte from 0085 — this migration adds a column
--    and a return field, nothing about who can create or read a page.

begin;

alter table public.card_share_public_pages add column back_image_key text;

comment on table public.card_share_public_pages is
  'Founder-approved public share pages (see migration 0085''s own header). One row per created share link. token is the only thing that grants access to view it — unguessable, never derived from order_id/card_id/participation_id. Every read re-verifies expires_at and the linked card''s current access_status; this table alone is never sufficient to prove a page is still viewable. back_image_key (0087) is null for templates with no approved back (see card-face-registry.ts) or for pages created before this migration.';

create or replace function public.create_card_share_public_page(
  p_order_id uuid,
  p_front_image_key text,
  p_back_image_key text default null
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

  insert into public.card_share_public_pages (order_id, card_id, token, guardian_profile_id, front_image_key, back_image_key, expires_at)
  values (p_order_id, v_card_id, v_token, auth.uid(), p_front_image_key, nullif(trim(p_back_image_key), ''), v_expires_at);

  return jsonb_build_object('token', v_token, 'expiresAt', v_expires_at);
end;
$$;

revoke all on function public.create_card_share_public_page(uuid, text, text) from public, anon;
grant execute on function public.create_card_share_public_page(uuid, text, text) to authenticated;

comment on function public.create_card_share_public_page(uuid, text, text) is
  'Re-runs get_card_share_eligibility itself before ever inserting — the calling route''s own prior eligibility check is never trusted. token is 256 bits of randomness from two gen_random_uuid() values, never derived from order_id/card_id. p_back_image_key (0087) is optional/nullable — omitted or blank for a template with no approved back.';

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

  return jsonb_build_object(
    'available', true,
    'frontImageKey', v_page.front_image_key,
    'backImageKey', v_page.back_image_key
  );
end;
$$;

revoke all on function public.get_card_share_public_page(text) from public, anon, authenticated;
grant execute on function public.get_card_share_public_page(text) to service_role;

comment on function public.get_card_share_public_page(text) is
  'Service-role only — the public page/image routes call this server-side, never exposed directly to a browser. Re-verifies expires_at and the linked card''s current access_status on every call; a suspended/revoked card stops resolving immediately regardless of remaining expiry window. backImageKey (0087) is null when the template has no approved back or the page predates this migration.';

commit;

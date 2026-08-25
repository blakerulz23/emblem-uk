-- ============================================================================
-- Guardian-controlled card-front social sharing — consent evidence and a
-- default-closed artwork-rights allowlist.
--
-- Two independent gates, both server-enforced, both required:
--
-- 1. AUTHORITY — is this specific caller the verified guardian of this
--    specific child's card? Two paths exist in this codebase today, and
--    only these two are ever trusted:
--    a. Ordinary builder, direct parent/guardian declaration: orders.
--       authority_status = 'confirmed' (migration 0071) AND the caller's
--       auth.uid() matches builder_order_authority_declarations.
--       adult_user_id for that order's submission_key.
--    b. Squad Invite, per-participation guardian: squad_invite_
--       participations.guardian_profile_id = auth.uid() AND the
--       participation has genuinely committed (commitment_completed_at is
--       not null) and is not cancelled/refunded/reversed/exception.
--    A coach/organiser/other-adult's own session is NEVER authority for
--    either path — for the ordinary builder's OTHER path (a non-guardian
--    submits, and a guardian later approves via a bare emailed token with
--    no login at all — respond_to_builder_guardian_approval, 0071 —
--    establishing orders.authority_status = 'guardian_approved'), there is
--    no authenticated session anywhere in this codebase that represents
--    "the approving guardian" to bind consent to. That gap is real,
--    disclosed, and deliberately NOT covered by this migration — see the
--    accompanying PR report.
--
-- 2. ARTWORK RIGHTS — separate from and never inferred from authority.
--    Founder instruction, recorded verbatim: "Do not treat parental
--    authority as evidence of intellectual-property permission... Default
--    to false. Uploaded badges, club logos, sponsor marks and licensed/
--    official collections must remain unshareable until their applicable
--    rights are documented and the asset is explicitly allowlisted. Never
--    infer permission from upload, purchase, guardian consent, builder
--    completion or existing display inside Emblem." card_social_share_
--    asset_rights below is that allowlist — it ships EMPTY. No card is
--    shareable through this system until a human explicitly inserts a row
--    documenting a real rights basis (this migration performs no such
--    review and asserts none). card_social_sharing_allowed(uuid)
--    computes the answer fresh from that table every time, never a stored/
--    cached flag that could drift from the allowlist's current state.
--
-- Consent itself is recorded by record_card_share_consent — the one
-- narrowly scoped SECURITY DEFINER RPC that is the sole write path into
-- card_share_consents. It re-derives every fact itself (auth.uid(),
-- authority, artwork rights, and the card-version hash) from server-held
-- state; the client supplies only the card_definition_id it wants to
-- share and the two confirmation booleans. No consent can be recorded
-- before every gate above passes.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1 — card_social_share_asset_rights: the artwork-rights allowlist.
-- Keyed by template_id today (the one identifier that already determines
-- which badge/collection artwork a card carries — see card_social_sharing_
-- allowed below for the exact reasoning). Populated only by a deliberate,
-- out-of-band legal/rights-review action — there is no RPC or application
-- code path that inserts into this table; it is service-role-writable only,
-- for a human to populate directly once rights are actually documented.
-- ----------------------------------------------------------------------------
create table public.card_social_share_asset_rights (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('template_collection')),
  asset_key text not null,
  rights_basis text not null check (rights_basis in ('emblem_owned', 'licensed_partner')),
  notes text check (notes is null or length(notes) <= 500),
  documented_by uuid references public.profiles(id) on delete set null,
  documented_at timestamptz not null default now(),
  unique (asset_type, asset_key)
);

comment on table public.card_social_share_asset_rights is
  'Default-closed artwork-rights allowlist for guardian card-front social sharing. Absence of a row means NOT shareable — this is the only signal card_social_sharing_allowed() trusts. Never populated by upload, purchase, guardian consent, or builder completion; only by a human directly documenting a real rights basis for a specific template/collection.';

alter table public.card_social_share_asset_rights enable row level security;
revoke all on public.card_social_share_asset_rights from public, anon, authenticated, service_role;
grant select, insert on public.card_social_share_asset_rights to service_role;

-- ----------------------------------------------------------------------------
-- Part 2 — card_social_sharing_allowed: computes, fresh every call, whether
-- a card_definitions row's artwork may appear in a social share. Never a
-- stored column — a stored flag could silently go stale if the allowlist
-- changes; this always reflects the allowlist's current state.
--
-- logo can be null (no badge — nothing to clear), a plain URL string (a
-- template-library asset, e.g. badgeSnapshotUrl — see 0048's authoritative-
-- order persistence), or a JSON object {storageKey, source:'upload'} (a
-- guardian/coach-uploaded badge — see the same migration). An uploaded
-- badge's rights are never established by this system at all: there is no
-- realistic per-upload rights-review process, so uploads are excluded
-- outright, regardless of the allowlist's contents.
-- ----------------------------------------------------------------------------
create function public.card_social_sharing_allowed(p_card_definition_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id text;
  v_logo_text text;
  v_logo_json jsonb;
  v_is_upload boolean := false;
begin
  select template_id, logo into v_template_id, v_logo_text
  from public.card_definitions
  where id = p_card_definition_id;

  if v_template_id is null then
    return false;
  end if;

  if v_logo_text is not null then
    begin
      v_logo_json := v_logo_text::jsonb;
      if v_logo_json ? 'source' and v_logo_json ->> 'source' = 'upload' then
        v_is_upload := true;
      end if;
    exception when others then
      -- Not parseable as JSON — a plain template-library URL string, not
      -- an upload. v_is_upload stays false.
      null;
    end;
  end if;

  if v_is_upload then
    return false;
  end if;

  return exists (
    select 1 from public.card_social_share_asset_rights
    where asset_type = 'template_collection' and asset_key = v_template_id
  );
end;
$$;

revoke all on function public.card_social_sharing_allowed(uuid) from public, anon, authenticated;
grant execute on function public.card_social_sharing_allowed(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 3 — card_share_consents: append-only consent evidence. Contains only
-- what is necessary — no player name, photo, team, club or card content is
-- duplicated here; card_version_hash is a fingerprint, not a copy. The
-- exported social image itself is never stored anywhere.
-- ----------------------------------------------------------------------------
create table public.card_share_consents (
  id uuid primary key default gen_random_uuid(),
  card_definition_id uuid not null references public.card_definitions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  -- Traceability pointer only, never a second source of truth: the specific
  -- declaration or participation row that established authority for this
  -- consent, so an audit can trace back to exactly which authority event
  -- justified it, without duplicating any of that row's own content here.
  authority_path text not null check (authority_path in ('builder_confirmed_guardian', 'squad_invite_guardian')),
  authority_reference_id uuid not null,
  guardian_user_id uuid not null references auth.users(id) on delete restrict,
  card_version_hash text not null,
  consent_wording_version text not null,
  confirmed_authority boolean not null,
  confirmed_recall_understanding boolean not null,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  constraint card_share_consents_confirmations_required check (
    confirmed_authority and confirmed_recall_understanding
  )
);

comment on table public.card_share_consents is
  'Append-only. Never updated by application code except withdrawn_at (no withdrawal RPC exists in this migration — the column is reserved for that narrow future capability, not yet built). A changed card_version_hash means the guardian must consent again; this table never overwrites a prior consent row to reflect new card content, it only ever gains new rows.';

create index card_share_consents_card_definition_idx on public.card_share_consents(card_definition_id);
create index card_share_consents_guardian_idx on public.card_share_consents(guardian_user_id);

alter table public.card_share_consents enable row level security;
revoke all on public.card_share_consents from public, anon, authenticated, service_role;
-- No grant to service_role either, matching player_deletion_requests
-- (migration 0041): every real read/write of this table happens
-- exclusively inside the SECURITY DEFINER RPC below, which bypasses table
-- grants entirely by running as the function owner. A direct table grant
-- here would be unused surface area, not a capability anything needs.

-- ----------------------------------------------------------------------------
-- Part 4 — record_card_share_consent: the sole write path. Accepts only the
-- order_id the client already legitimately holds from its own successful
-- submission response, plus the two confirmation booleans — never a
-- guardian id, authority status, card_definition_id, or card-version hash.
-- Every other fact, including which card_definitions row this order
-- produced, is re-derived here from server-held state. order_id alone is
-- unambiguous for both supported authority paths: an ordinary single-
-- player order and a Squad Invite participation each produce exactly one
-- card_definitions row.
-- ----------------------------------------------------------------------------
create function public.record_card_share_consent(
  p_order_id uuid,
  p_confirmed_authority boolean,
  p_confirmed_recall_understanding boolean,
  p_consent_wording_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card_definition_id uuid;
  v_template_id text;
  v_name text;
  v_number text;
  v_team text;
  v_position text;
  v_logo text;
  v_photo text;
  v_hash text;
  v_authority_path text;
  v_authority_reference_id uuid;
  v_consent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_consent_wording_version is null or length(trim(p_consent_wording_version)) = 0 then
    raise exception 'consent_wording_version is required';
  end if;
  if not (coalesce(p_confirmed_authority, false) and coalesce(p_confirmed_recall_understanding, false)) then
    raise exception 'both confirmations are required';
  end if;

  if p_order_id is null then
    raise exception 'order_id is required';
  end if;

  -- Exactly one card_definitions row per order for both supported
  -- authority paths (an ordinary single-player order, or a Squad Invite
  -- participation) — never ambiguous, and never a client-supplied id.
  select id, template_id, name, number, team, "position", logo, photo::text
  into v_card_definition_id, v_template_id, v_name, v_number, v_team, v_position, v_logo, v_photo
  from public.card_definitions
  where order_id = p_order_id
  limit 1;

  if v_card_definition_id is null then
    raise exception 'Card not found for this order';
  end if;

  if not public.card_social_sharing_allowed(v_card_definition_id) then
    raise exception 'This card''s artwork is not cleared for social sharing';
  end if;

  -- Authority path 1: Squad Invite, per-participation guardian.
  select id into v_authority_reference_id
  from public.squad_invite_participations
  where order_id = p_order_id
    and guardian_profile_id = auth.uid()
    and commitment_completed_at is not null
    and status not in ('cancelled', 'refunded', 'reversed', 'exception');

  if v_authority_reference_id is not null then
    v_authority_path := 'squad_invite_guardian';
  else
    -- Authority path 2: ordinary builder, direct parent/guardian
    -- declaration only. guardian_approved (a non-guardian submitted, a
    -- guardian approved via a bare emailed token with no login) is
    -- deliberately never accepted here — there is no authenticated
    -- session anywhere in that path to bind this consent to.
    select d.id into v_authority_reference_id
    from public.builder_order_authority_declarations d
    join public.orders o on o.id = d.order_id
    where d.order_id = p_order_id
      and d.adult_user_id = auth.uid()
      and d.relationship = 'parent_guardian'
      and o.authority_status = 'confirmed';

    if v_authority_reference_id is not null then
      v_authority_path := 'builder_confirmed_guardian';
    end if;
  end if;

  if v_authority_path is null then
    raise exception 'Not authorized to share this card';
  end if;

  v_hash := md5(concat_ws('|', v_template_id, v_name, coalesce(v_number, ''), coalesce(v_team, ''), coalesce(v_position, ''), coalesce(v_logo, ''), coalesce(v_photo, '')));

  insert into public.card_share_consents (
    card_definition_id, order_id, authority_path, authority_reference_id,
    guardian_user_id, card_version_hash, consent_wording_version,
    confirmed_authority, confirmed_recall_understanding
  ) values (
    v_card_definition_id, p_order_id, v_authority_path, v_authority_reference_id,
    auth.uid(), v_hash, p_consent_wording_version,
    p_confirmed_authority, p_confirmed_recall_understanding
  )
  returning id into v_consent_id;

  return jsonb_build_object('ok', true, 'consentId', v_consent_id, 'cardVersionHash', v_hash);
end;
$$;

revoke all on function public.record_card_share_consent(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.record_card_share_consent(uuid, boolean, boolean, text) to authenticated;

commit;

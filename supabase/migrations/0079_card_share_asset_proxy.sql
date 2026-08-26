-- Guardian-controlled card-front sharing (Work Package B, draft) — same-
-- origin asset proxy support.
--
-- Fixes a live-preview-verified defect: the shared image reproduced the
-- card design and badge but not the player's photograph. Root cause: by
-- the time "Order received" (and therefore the share button) exists at
-- all, the player's photo — and any player-uploaded club crest — has
-- already been moved to S3 and is referenced only by a private storage
-- key (card_definitions.photo/logo — see migration 0019's own comment:
-- "never a long-lived or public URL... every reader signs a fresh URL at
-- render time"). A signed download URL displays fine as a plain <img>,
-- but html2canvas cannot draw a cross-origin image onto canvas without the
-- bucket's CORS cooperation, which this app's production bucket correctly
-- does not grant (these are private, non-public child photos) — that is
-- what silently dropped the photo layer from the captured share image.
--
-- The fix is a same-origin server-side proxy route (added alongside this
-- migration): it fetches the object from S3 itself — a server-to-server
-- request, where CORS never applies — and returns the bytes from the
-- app's own origin. This function is what that route calls to resolve
-- *which* key it is allowed to read, so the route itself never trusts a
-- client-supplied key or re-derives authorization on its own: it re-runs
-- the exact same, already-reviewed eligibility check
-- get_card_share_eligibility already performs, and only ever returns a key
-- for the one card_definitions row that check resolves to.
begin;

create or replace function public.get_card_share_asset_key(
  p_order_id uuid,
  p_kind text
)
returns text
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_eligibility jsonb;
  v_definition record;
  v_logo_json jsonb;
begin
  if p_kind is null or p_kind not in ('photo', 'badge') then
    return null;
  end if;

  -- Re-derives eligibility itself on every call, exactly like
  -- record_card_share_consent already does for writes — never trusts a
  -- client-supplied "I already checked eligibility" claim, and a card that
  -- has since become suspended/revoked/re-drafted stops resolving a key
  -- immediately, with no separate revocation step needed here.
  v_eligibility := public.get_card_share_eligibility(p_order_id);
  if (v_eligibility ->> 'eligible')::boolean is not true then
    return null;
  end if;

  select * into v_definition
  from public.card_definitions
  where id = (v_eligibility ->> 'artworkCardDefinitionId')::uuid;

  if v_definition.id is null then
    return null;
  end if;

  if p_kind = 'photo' then
    -- card_definitions.photo is {storageKey, contentType, crop, bgRemoved}
    -- (migration 0019) — never a URL. A null/blank storageKey (should not
    -- happen for an approved single-child card, but not assumed) resolves
    -- to no key rather than an empty-string S3 lookup.
    return nullif(v_definition.photo ->> 'storageKey', '');
  end if;

  -- badge/logo is only ever an S3 key when the guardian uploaded their own
  -- crest (stored as the JSON-encoded text '{"storageKey":"...",
  -- "source":"upload"}' — see migration 0048's insert). A resolved static
  -- club-crest reference is a plain same-origin path string instead
  -- (e.g. '/templates/emjfl/clubs/...png') and is not JSON at all — the
  -- exception handler below treats that, and any other non-JSON value, as
  -- "nothing to proxy", matching the calling route's/client's existing
  -- rule that a same-origin path never needs localising in the first
  -- place.
  begin
    v_logo_json := v_definition.logo::jsonb;
  exception when others then
    return null;
  end;
  if v_logo_json ->> 'source' is distinct from 'upload' then
    return null;
  end if;
  return nullif(v_logo_json ->> 'storageKey', '');
end;
$$;

revoke all on function public.get_card_share_asset_key(uuid, text) from public, anon;
grant execute on function public.get_card_share_asset_key(uuid, text) to authenticated;

commit;

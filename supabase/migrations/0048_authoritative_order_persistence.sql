-- Stage 6 — server-authoritative, idempotent, atomic order persistence.
--
-- Replaces order-enquiry's current sequential PostgREST writes (orders,
-- then a per-player loop of players/cards/card_definitions/moments, each
-- its own independent HTTP call/transaction) with ONE PostgreSQL function
-- call, so the whole submission commits or nothing does. Confirmed via
-- audit: this app has no direct Postgres connection at runtime, only
-- Supabase-js/PostgREST (src/lib/supabase/server.ts) — sequential
-- .from(...).insert() calls are never atomic across each other, so a
-- SECURITY DEFINER function is the only mechanism available that can make
-- this genuinely one transaction. No existing .rpc() call anywhere in this
-- codebase runs on the service-role client (0037_service_role_least_
-- privilege.sql's own audit confirms this); this migration is the first,
-- and grants EXECUTE to service_role deliberately narrowly — no table-level
-- grant is added for order_line_items/order_coach_cards, since the
-- function runs as its owner (postgres) and needs none.
--
-- Historical compatibility: every column added below is nullable with no
-- default, so all 42 existing production orders keep reading back
-- unaffected — exactly 0045's own established pattern.

-- ---------------------------------------------------------------------------
-- orders — idempotency identity. A plain (non-partial) UNIQUE constraint on
-- a nullable column is sufficient in Postgres: NULL is never considered
-- equal to another NULL under UNIQUE, so every historical order (and any
-- future non-Builder order-creation path) can stay NULL here forever
-- without colliding with anything or with each other.
-- ---------------------------------------------------------------------------
alter table orders add column submission_key uuid unique;
alter table orders add column submission_fingerprint text;

comment on column orders.submission_key is
  'Client-generated (crypto.randomUUID()) idempotency key for one Builder submission attempt — never the old hardcoded emblem-local-order value. NULL for every order created before Stage 6 and for any non-Builder order-creation path.';
comment on column orders.submission_fingerprint is
  'Hash of the submitted content (players + coach card + derived pricing inputs), recorded alongside submission_key so a retry of the same key with materially different content is rejected rather than silently returning a mismatched order.';

-- ---------------------------------------------------------------------------
-- create_authoritative_order — the one atomic transaction boundary for a
-- Builder submission. Every parameter is an explicit, typed/shape-checked
-- value, never a single opaque JSON blob passed straight to an insert —
-- p_players/p_coach_card are jsonb only because their cardinality/shape is
-- caller-defined, and every field read out of them below is validated
-- before use, not blindly trusted or inserted as-is.
--
-- Pricing (currency/pricing_tier/paid_player_count/total_print_quantity/
-- unit_price_pence/subtotal_pence/pricing_version) is never recomputed here
-- — it arrives pre-derived from src/lib/pricing-engine.ts's priceOrder(),
-- the single source of truth for these commercial rules (see
-- src/app/api/order-enquiry/route.ts). Re-implementing that arithmetic in
-- PL/pgSQL would create a second copy of the same rules that could drift;
-- instead this function re-validates the result is internally coherent
-- using the exact same CHECK constraints 0045 already put on `orders`
-- (orders_pricing_snapshot_arithmetic, orders_pricing_tier_matches_player_
-- count) — those constraints are the real backstop against a caller bug or
-- tampering, not a second pricing engine.
create or replace function public.create_authoritative_order(
  p_submission_key uuid,
  p_request_fingerprint text,
  p_order_ref text,
  p_purchaser_email text,
  p_source text,
  p_print_files jsonb,
  p_club_name text,
  p_team_name text,
  p_currency text,
  p_pricing_tier text,
  p_paid_player_count integer,
  p_total_print_quantity integer,
  p_unit_price_pence integer,
  p_subtotal_pence integer,
  p_pricing_version integer,
  p_players jsonb,
  p_coach_card jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_prefix text;
  v_print_file_prefix text;
  v_existing_id uuid;
  v_existing_ref text;
  v_existing_fingerprint text;
  v_order_id uuid;
  v_player jsonb;
  v_player_ids text[] := '{}';
  v_player_id uuid;
  v_card_id uuid;
  v_definition_id uuid;
  v_claim_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_claim_bytes bytea;
  v_claim_token text;
  v_attempt int;
  v_coach_valid_team boolean;
  v_player_card_description text;
  v_print_file jsonb;
  v_print_file_player_ids text[] := '{}';
begin
  ------------------------------------------------------------------------
  -- Basic shape validation — defense in depth. src/app/api/order-enquiry/
  -- route.ts already validates all of this more richly (against the real
  -- TypeScript template/collection enum, etc.) before ever calling this
  -- function, but this function must never trust that it was the only
  -- caller.
  ------------------------------------------------------------------------
  if p_submission_key is null then
    raise exception 'submission_key is required';
  end if;
  if p_purchaser_email is null or length(trim(p_purchaser_email)) = 0 then
    raise exception 'purchaser_email is required';
  end if;
  if p_source is null or p_source not in ('team_order', 'standalone_order') then
    raise exception 'invalid source';
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 1 then
    raise exception 'at least one player is required';
  end if;
  if jsonb_array_length(p_players) > 200 then
    raise exception 'too many players in one submission';
  end if;

  v_asset_prefix := 'order-assets/' || p_submission_key::text || '/';
  v_print_file_prefix := 'print-files/' || p_submission_key::text || '/';

  -- Distinct client player identifiers, valid required fields, positive
  -- print quantities, and every photo key genuinely belongs to THIS
  -- submission's asset namespace — never another order's, never a
  -- blob:/data:/public URL (those never match the order-assets/ prefix).
  for v_player in select * from jsonb_array_elements(p_players)
  loop
    if v_player->>'id' is null or length(trim(v_player->>'id')) = 0 then
      raise exception 'every player requires a client id';
    end if;
    v_player_ids := array_append(v_player_ids, v_player->>'id');

    if v_player->>'name' is null or length(trim(v_player->>'name')) = 0 then
      raise exception 'every player requires a non-blank name';
    end if;
    if v_player->>'photoKey' is null or left(v_player->>'photoKey', length(v_asset_prefix)) <> v_asset_prefix then
      raise exception 'player photo key does not belong to this submission';
    end if;
    if (v_player->>'prints') is null or (v_player->>'prints')::int < 1 or (v_player->>'prints')::int > 100 then
      raise exception 'invalid print quantity for player %', v_player->>'id';
    end if;
    -- Asset-integrity amendment — a submitted custom badge upload
    -- reference (v_player->>'badgeStorageKey') is optional (most players
    -- have none — see the Stage 6 asset-completeness report on how rare
    -- an actual upload is in the current builder UI), but when present it
    -- must be a real key in this submission's own namespace, independent
    -- of and in addition to whatever src/lib/order-enquiry-validation.ts
    -- already checked upstream — this function must never trust it was
    -- the only caller.
    if v_player->>'badgeStorageKey' is not null and length(trim(v_player->>'badgeStorageKey')) > 0 then
      if left(v_player->>'badgeStorageKey', length(v_asset_prefix)) <> v_asset_prefix then
        raise exception 'badge key for player % does not belong to this submission', v_player->>'id';
      end if;
      if nullif(trim(v_player->>'badgeSnapshotUrl'), '') is not null or nullif(trim(v_player->>'badgeUrl'), '') is not null then
        raise exception 'uploaded badge for player % contains a non-authoritative URL', v_player->>'id';
      end if;
    elsif nullif(trim(v_player->>'badgeUrl'), '') is not null then
      raise exception 'badge URL for player % is not an authoritative reference', v_player->>'id';
    elsif nullif(trim(v_player->>'badgeSnapshotUrl'), '') is not null
      and not ((v_player->>'badgeSnapshotUrl') = any (array[
        '/templates/emjfl/clubs/curzon-ashton.png',
        '/templates/emjfl/clubs/ashton-united.png',
        '/templates/emjfl/clubs/wythenshawe-town.png',
        '/templates/emjfl/clubs/wythenshawe-fc.png',
        '/templates/emjfl/clubs/abbey-hey.png',
        '/templates/emjfl/clubs/saddleworth-3ds.png',
        '/templates/emjfl/clubs/irlam-jfc.png',
        '/templates/emjfl/clubs/milnrow-juniors.png',
        '/templates/emjfl/clubs/failsworth-villa.png',
        '/templates/emjfl/clubs/failsworth-dynamos.png',
        '/templates/emjfl/clubs/mcjfc.png',
        '/templates/emjfl/clubs/cheadle-town.png',
        '/templates/emjfl/clubs/avro-fc.png',
        '/templates/emjfl/clubs/glossop-north-end.png',
        '/templates/emjfl/clubs/santos.png',
        '/templates/emjfl/clubs/safc.png',
        '/templates/emjfl/clubs/trafford-fc.png',
        '/templates/emjfl/clubs/hazel-grove-united.png',
        '/templates/emjfl/clubs/ocfc.png',
        '/templates/emjfl/clubs/afc-oldham.png'
      ]))
    then
      raise exception 'badge reference for player % is not a recognised static asset', v_player->>'id';
    end if;
  end loop;

  if (select count(*) from unnest(v_player_ids) x) <> (select count(distinct x) from unnest(v_player_ids) x) then
    raise exception 'duplicate player identifiers in submission';
  end if;

  ------------------------------------------------------------------------
  -- Print-file completeness — exactly one verified PDF per submitted
  -- player, enforced here independently of src/lib/order-enquiry-
  -- validation.ts (defense in depth, same reasoning as every other check
  -- in this function). Applies unconditionally to every call this
  -- function ever receives; it never touches a historical order (rows
  -- written by the pre-Stage-6 sequential-insert path are never written
  -- by this function at all, so their possibly-null print_files are
  -- completely unaffected by this rule existing).
  ------------------------------------------------------------------------
  if p_print_files is null or jsonb_typeof(p_print_files) <> 'array' or jsonb_array_length(p_print_files) = 0 then
    raise exception 'a print file is required for every approved player';
  end if;
  if jsonb_array_length(p_print_files) <> jsonb_array_length(p_players) then
    raise exception 'print file count does not match player count';
  end if;

  for v_print_file in select * from jsonb_array_elements(p_print_files)
  loop
    if v_print_file->>'playerId' is null or length(trim(v_print_file->>'playerId')) = 0 then
      raise exception 'a print file entry is missing a player id';
    end if;
    if v_print_file->>'key' is null or left(v_print_file->>'key', length(v_print_file_prefix)) <> v_print_file_prefix then
      raise exception 'a print file does not belong to this submission';
    end if;
    v_print_file_player_ids := array_append(v_print_file_player_ids, v_print_file->>'playerId');
  end loop;

  if (select count(*) from unnest(v_print_file_player_ids) x) <> (select count(distinct x) from unnest(v_print_file_player_ids) x) then
    raise exception 'duplicate print file for the same player';
  end if;
  -- Cardinality + these two containment checks together prove an exact
  -- bijection: every print-file player id is a submitted player, and
  -- every submitted player has exactly one print file — no fewer, no
  -- extra, no substitution.
  if not (v_player_ids @> v_print_file_player_ids) then
    raise exception 'a print file references a player outside this submission';
  end if;
  if not (v_print_file_player_ids @> v_player_ids) then
    raise exception 'missing print file for a submitted player';
  end if;

  -- A coach must never masquerade as a paid player — no submitted player
  -- may reuse the coach's own photo asset.
  if p_coach_card is not null and p_coach_card->>'photoKey' is not null then
    if exists (
      select 1 from jsonb_array_elements(p_players) player
      where player->>'photoKey' = p_coach_card->>'photoKey'
    ) then
      raise exception 'coach photo cannot be reused as a player photo';
    end if;
  end if;

  ------------------------------------------------------------------------
  -- Idempotency — first check (cheap, avoids doing real work for an
  -- obvious retry). The unique constraint on orders.submission_key is the
  -- real guarantee under a genuine race; the exception handler on the
  -- insert below covers that case.
  ------------------------------------------------------------------------
  select id, order_ref, submission_fingerprint
    into v_existing_id, v_existing_ref, v_existing_fingerprint
  from public.orders
  where submission_key = p_submission_key;

  if v_existing_id is not null then
    if v_existing_fingerprint is distinct from p_request_fingerprint then
      raise exception 'submission_key reused with different content';
    end if;
    return jsonb_build_object('orderId', v_existing_id, 'orderRef', v_existing_ref, 'created', false);
  end if;

  ------------------------------------------------------------------------
  -- Coach-card eligibility/completeness — validated before any write, so
  -- an ineligible-but-submitted coachCard, or an eligible-but-incomplete
  -- one, rejects the ENTIRE submission (nothing partial).
  ------------------------------------------------------------------------
  if p_coach_card is not null then
    if p_pricing_tier is distinct from 'squad' then
      raise exception 'coach card is not eligible for this order';
    end if;
    if p_coach_card->>'fullName' is null or length(trim(p_coach_card->>'fullName')) = 0
      or p_coach_card->>'roleTitle' is null or length(trim(p_coach_card->>'roleTitle')) = 0
      or p_coach_card->>'clubName' is null or length(trim(p_coach_card->>'clubName')) = 0
      or p_coach_card->>'teamName' is null or length(trim(p_coach_card->>'teamName')) = 0
      or p_coach_card->>'photoKey' is null or length(trim(p_coach_card->>'photoKey')) = 0
    then
      raise exception 'incomplete coach card details';
    end if;
    if left(p_coach_card->>'photoKey', length(v_asset_prefix)) <> v_asset_prefix then
      raise exception 'coach photo key does not belong to this submission';
    end if;

    -- The selected club/team must belong to the submitted order — accepts
    -- Stage 5B's combined club/team snapshot explicitly: this product has
    -- one grouping identity, not two independently known values, so both
    -- clubName and teamName are checked against the same players[].club
    -- field, not two different sources.
    select exists (
      select 1 from jsonb_array_elements(p_players) player
      where player->>'club' = p_coach_card->>'clubName'
    ) into v_coach_valid_team;
    if not v_coach_valid_team then
      raise exception 'coach club/team is not part of this order';
    end if;
    select exists (
      select 1 from jsonb_array_elements(p_players) player
      where player->>'club' = p_coach_card->>'teamName'
    ) into v_coach_valid_team;
    if not v_coach_valid_team then
      raise exception 'coach club/team is not part of this order';
    end if;
  elsif p_pricing_tier = 'squad' then
    -- An authoritative Squad quote requires exactly one complete coachCard
    -- block — the free coach card is part of what a Squad order *is*, not
    -- an optional add-on the schema is neutral about. The builder UI
    -- already blocks submission client-side until one is complete
    -- (ProductionBuilder.tsx's canSendEnquiry/coachCardComplete); this is
    -- the server-side backstop for a request that bypassed that UI.
    raise exception 'a squad order requires complete coach card details';
  end if;

  ------------------------------------------------------------------------
  -- Write everything. Any exception from here on rolls back the entire
  -- function (and therefore this whole submission) — no partial order.
  ------------------------------------------------------------------------
  begin
    insert into public.orders (
      order_ref, purchaser_email, source, payment_status, print_files,
      club_name, team_name, submission_key, submission_fingerprint,
      currency, pricing_tier, paid_player_count, total_print_quantity,
      unit_price_pence, subtotal_pence, pricing_version, priced_at
    ) values (
      p_order_ref, p_purchaser_email, p_source, 'order_intent', p_print_files,
      p_club_name, p_team_name, p_submission_key, p_request_fingerprint,
      p_currency, p_pricing_tier, p_paid_player_count, p_total_print_quantity,
      p_unit_price_pence, p_subtotal_pence, p_pricing_version, now()
    )
    returning id into v_order_id;
  exception when unique_violation then
    -- A genuinely concurrent duplicate request won the race on
    -- submission_key between this function's own lookup above and its
    -- insert — re-fetch and return the winner's row exactly like the
    -- ordinary idempotent-retry path, rather than surfacing a raw
    -- constraint error to a customer who did nothing wrong.
    select id, order_ref, submission_fingerprint
      into v_existing_id, v_existing_ref, v_existing_fingerprint
    from public.orders
    where submission_key = p_submission_key;

    if v_existing_id is null then
      raise; -- some other unique_violation (e.g. order_ref) — a real error
    end if;
    if v_existing_fingerprint is distinct from p_request_fingerprint then
      raise exception 'submission_key reused with different content';
    end if;
    return jsonb_build_object('orderId', v_existing_id, 'orderRef', v_existing_ref, 'created', false);
  end;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    insert into public.players (name, "position", squad_number)
    values (
      trim(v_player->>'name'),
      nullif(v_player->>'position', ''),
      case when v_player->>'kitNo' ~ '^[0-9]+$' then (v_player->>'kitNo')::int else null end
    )
    returning id into v_player_id;

    -- Claim token — same alphabet/length as generateClaimCode() in
    -- src/lib/claim-code.ts, same retry-on-collision shape as
    -- withUniqueCodeRetry(). Entropy comes from gen_random_uuid() (a core
    -- pg_catalog builtin since PG13, already the default for every id
    -- column in this schema — safe to call unqualified under
    -- search_path='') decoded via the equally core encode/decode hex
    -- functions, deliberately NOT pgcrypto's gen_random_bytes: pgcrypto is
    -- commonly installed into a separate `extensions` schema on Supabase
    -- projects, which search_path='' would hide, and this repo has never
    -- confirmed which schema it lives in here.
    v_card_id := null;
    for v_attempt in 1..5 loop
      v_claim_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      v_claim_token := '';
      for i in 0..6 loop
        v_claim_token := v_claim_token || substr(v_claim_alphabet, 1 + (get_byte(v_claim_bytes, i) % 32), 1);
      end loop;
      begin
        insert into public.cards (claim_token, player_id, order_id, status)
        values (v_claim_token, v_player_id, v_order_id, 'assigned')
        returning id into v_card_id;
        exit;
      exception when unique_violation then
        if v_attempt = 5 then
          raise exception 'could not generate a unique claim token';
        end if;
      end;
    end loop;

    if coalesce(length(trim(v_player->>'club')), 0) > 0 and coalesce(length(trim(v_player->>'templateId')), 0) > 0 then
      insert into public.card_definitions (
        status, template_id, name, number, team, "position", logo, photo, stats, order_id, player_id
      ) values (
        'approved',
        v_player->>'templateId',
        trim(v_player->>'name'),
        nullif(v_player->>'kitNo', ''),
        v_player->>'club',
        nullif(v_player->>'position', ''),
        case
          when nullif(trim(v_player->>'badgeStorageKey'), '') is not null then
            jsonb_build_object('storageKey', v_player->>'badgeStorageKey', 'source', 'upload')::text
          when nullif(trim(v_player->>'badgeSnapshotUrl'), '') is not null then v_player->>'badgeSnapshotUrl'
          else null
        end,
        v_player->'photo',
        v_player->'stats',
        v_order_id,
        v_player_id
      )
      returning id into v_definition_id;

      update public.cards set card_definition_id = v_definition_id where id = v_card_id;

      insert into public.moments (player_id, title, occurred_on, trust, verification_status, card_definition_id, source)
      values (v_player_id, 'Card Created', current_date, 'club', 'system_generated', v_definition_id, 'system')
      on conflict do nothing;
    end if;
  end loop;

  v_player_card_description := p_total_print_quantity || ' player card print' || case when p_total_print_quantity = 1 then '' else 's' end;
  insert into public.order_line_items (order_id, kind, description, quantity, unit_price_pence, subtotal_pence, currency)
  values (v_order_id, 'player_card', v_player_card_description, p_total_print_quantity, p_unit_price_pence, p_subtotal_pence, p_currency);

  if p_coach_card is not null then
    insert into public.order_coach_cards (order_id, full_name, role_title, club_name, team_name, photo_key)
    values (
      v_order_id,
      trim(p_coach_card->>'fullName'),
      trim(p_coach_card->>'roleTitle'),
      trim(p_coach_card->>'clubName'),
      trim(p_coach_card->>'teamName'),
      p_coach_card->>'photoKey'
    );

    insert into public.order_line_items (order_id, kind, description, quantity, unit_price_pence, subtotal_pence, currency)
    values (v_order_id, 'coach_card', 'Free coach card', 1, 0, 0, p_currency);
  end if;

  return jsonb_build_object('orderId', v_order_id, 'orderRef', p_order_ref, 'created', true);
end;
$$;

-- No table-level grant to service_role for order_line_items/order_coach_
-- cards — the function runs as its owner (postgres, the migration role)
-- under SECURITY DEFINER, which already has full access; service_role only
-- ever needs EXECUTE on the function itself.
revoke all on function public.create_authoritative_order(
  uuid, text, text, text, text, jsonb, text, text, text, text, integer, integer, integer, integer, integer, jsonb, jsonb
) from public;
revoke all on function public.create_authoritative_order(
  uuid, text, text, text, text, jsonb, text, text, text, text, integer, integer, integer, integer, integer, jsonb, jsonb
) from anon;
revoke all on function public.create_authoritative_order(
  uuid, text, text, text, text, jsonb, text, text, text, text, integer, integer, integer, integer, integer, jsonb, jsonb
) from authenticated;
grant execute on function public.create_authoritative_order(
  uuid, text, text, text, text, jsonb, text, text, text, text, integer, integer, integer, integer, integer, jsonb, jsonb
) to service_role;

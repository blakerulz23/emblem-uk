-- Collection OS Product Specification v1.0 — the Card Definition becomes a
-- first-class platform domain object, alongside Player, Season, Moment, and
-- Team. Builder is its authoring environment, not its owner: every surface
-- (Collection OS's screen renderer today, print's raster/PDF pipeline
-- today, native apps and marketing assets in future) consumes the same row
-- through the same renderer (src/components/builder/emblem/CardArt.tsx),
-- never a re-implementation of the design.
--
-- Deliberately a flat, frozen shape matching exactly what CardArt already
-- takes as props (see src/lib/emblem-uk-builder.ts's productionPayload()
-- and ProductionBuilder.tsx's PlayerCard adapter) — `team`/`logo` are
-- resolved, storable values baked in at authoring time, not live
-- re-derivations from order/club state that could drift after the fact.
create table card_definitions (
  id uuid primary key default gen_random_uuid(),
  -- 'draft' is reserved for a future Builder editing workflow that doesn't
  -- exist yet — today every row is written as 'approved' at the same point
  -- Builder's submit flow already captures the print raster. Included now
  -- so that future workflow doesn't need a schema change to arrive.
  status text not null default 'draft' check (status in ('draft', 'approved')),
  template_id text not null,
  sport text not null default 'soccer',
  name text not null,
  number text,
  team text not null,
  position text,
  -- A resolved, order-independent badge/crest reference (club crests are
  -- public-ish marketing assets, not personal data) — safe to store as a
  -- plain reference, unlike `photo` below.
  logo text,
  -- The player's own photo is not public — this stores only the durable
  -- S3 reference + crop state ({storageKey, contentType, crop:{scale,x,y},
  -- bgRemoved}), never a long-lived or public URL. Every reader signs a
  -- fresh URL at render time via getSignedDownloadUrl, matching this
  -- codebase's existing convention for every other player photo/media
  -- reference.
  photo jsonb,
  stats jsonb,
  -- Traceability only — a renderer never re-derives display data from
  -- these; the row above is the frozen, authoritative design.
  order_id uuid references orders (id) on delete set null,
  player_id uuid references players (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table card_definitions enable row level security;

grant select on card_definitions to authenticated;

-- Added before the policies below, since both reference it.
alter table cards add column card_definition_id uuid references card_definitions (id);

create index cards_card_definition_id_idx on cards (card_definition_id);

-- No insert/update/delete policy — matches cards' own "secure by default"
-- convention exactly. Every write goes through Builder's submit flow using
-- the service-role client.
create policy "card_definitions: visible to guardians of the linked player"
  on card_definitions for select
  using (
    exists (
      select 1 from cards c
      join guardians g on g.player_id = c.player_id
      where c.card_definition_id = card_definitions.id and g.profile_id = auth.uid()
    )
  );

create policy "card_definitions: visible to coaches of the linked player's team"
  on card_definitions for select
  using (
    exists (
      select 1 from cards c
      join players p on p.id = c.player_id
      join coach_team ct on ct.team_id = p.team_id
      where c.card_definition_id = card_definitions.id and ct.profile_id = auth.uid()
    )
  );

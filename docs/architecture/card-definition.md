# Card Definition → CardFace → CardArt

## What this is

The Card Definition is a first-class platform domain object (Collection OS
Product Specification v1.0), alongside Player, Season, Moment, and Team —
the canonical, authored design of a physical/digital card. This document
explains the three-layer pipeline that turns one into rendered output, and
why every consumer should go through it rather than reaching into the
bottom layer directly.

```
Card Definition (data)  →  CardFace (renderer)  →  CardArt (visual implementation)
```

## The three layers

### 1. Card Definition — the data

The frozen, authored facts about one card: template, name, number, team,
position, logo, photo (crop + a durable storage reference, never a public
URL), stats. Two shapes exist today:

- **`CardFaceData`** (`src/lib/card-definition.tsx`) — the normalized,
  in-memory shape every renderer actually consumes.
- **`CardDefinitionRow`** (same file) — the persisted shape, matching the
  `card_definitions` table (`supabase/migrations/0019_card_definitions.sql`).
  `cardDefinitionToFaceData()` maps a row to `CardFaceData`.

Builder derives a `CardFaceData` directly from live wizard state instead
(`orderPlayerToFaceData()` in `src/components/emblem-uk/ProductionBuilder.tsx`)
— no `card_definitions` row exists yet at that point in the flow. **This is
the one place the two real consumers legitimately differ**: *where the data
comes from*. Everything downstream of that is identical.

### 2. CardFace — the renderer

`CardFace` (`src/lib/card-definition.tsx`) is the platform-level renderer.
It takes a `CardFaceData` + `side` (`'front' | 'back'`) + `size` + an
already-resolved `photoUrl`, resolves the template (`resolveCardTemplate()`),
assembles `CardArt`'s exact prop contract, and renders it.

**This is the one place template resolution and prop assembly happen.**
Before Milestone 2B, Builder's `PlayerCard` did this resolution inline,
independently of anything Collection OS would have needed to do the same
job — two implementations of "turn some input into a rendered card,"
which is exactly the kind of drift this pipeline exists to prevent. `PlayerCard`
now does nothing but map wizard state to `CardFaceData` and render
`<CardFace>` — the same component call Collection OS makes from its own
data source.

### 3. CardArt — the canonical visual implementation

`CardArt` (`src/components/builder/emblem/CardArt.tsx`) is the actual
layout/typography/positioning/template-family rendering engine. It is
**not owned by the football-card feature or by Collection OS** — it's
shared across the entire Emblem builder platform (stickers, puzzles,
posters, magnets, keychains all depend on it too). It stays exactly where
it is; nothing about this pipeline moves or forks it.

## Why consume CardFace, not CardArt directly

`CardArt`'s prop contract is easy to get subtly wrong by hand: which
template a `template_id` string resolves to, what a missing `number`/
`position` should fall back to, how photo crop state maps to
`photoScale`/`photoOffsetX`/`photoOffsetY`. Calling `CardArt` directly means
re-deriving all of that — which is precisely what happened before Milestone
2B, and precisely what silently drifts once there are two independent
implementations instead of one.

**Going through `CardFace` guarantees:**

- One source of truth for layout, typography, positioning, and template
  logic — a template rendering change only ever has to happen once.
- Print and screen output can never visually diverge, because they are
  the same render, not two renderers being kept in sync by convention.
- A new consumer only has to solve one problem: "how do I get a
  `CardFaceData`" — never "how do I correctly re-implement rendering."

## Current consumers

| Consumer | Gets `CardFaceData` from | Where |
|---|---|---|
| Builder (live preview, template picker, review list, print-capture rig) | Live wizard `order`/`player` state | `orderPlayerToFaceData()`, `ProductionBuilder.tsx` |
| Collection OS's Card screen | A persisted `card_definitions` row | `cardDefinitionToFaceData()`, `src/lib/card-definition.tsx` (wired into `Card.tsx` in Milestone 2C) |

## Extending this for future surfaces

- **Any future React/DOM surface** (a new Collection OS screen, a
  marketing landing page embedding a live card preview) renders through
  `CardFace` directly, same as the two consumers above. Never import
  `CardArt` directly outside this file.
- **A future native app** (iOS/Android, not React DOM) cannot literally
  reuse `CardFace`/`CardArt` — but it should still consume the same
  `card_definitions` data contract, and its own native renderer becomes a
  third, deliberate implementation of *this same pipeline's second layer*,
  not a fork of the data model. The Card Definition is the part of this
  pipeline meant to outlive any one renderer's technology.
- **Print** stays a caller of `CardFace` too (via Builder's capture rig,
  which mounts `CardFace`/`PlayerCard` off-screen and rasterizes it) —
  it is not a separate rendering path to keep in sync.

# Emblem Canada Hockey — ADR-7 second-sport test findings

**Status:** Concept preview only. No schema, route, pricing-engine or
external-service change has been made.

**What this is:** The Platform Architecture Roadmap's ADR-7 commits v1 to
football-first primitives that must pass a "second-sport test" — could
another sport use the core domain without a schema rewrite? This document
records the results of actually running that test: porting the Squad
Invite board-first flow to Canadian minor hockey as a synthetic preview
(`/review/hockey-canada`).

## Verdict

The core domain passes. The campaign/participation/tier-pricing/
payment-after-close machinery required **zero conceptual change** —
hockey slotted straight in. Every gap found lives exactly where ADR-7
predicted sport-specific definitions should live: vocabulary, stats,
templates, and market-level commerce settings.

## What held with no changes (sport-agnostic primitives)

- **Campaign shape** — organiser, team, age division, deadline,
  estimated roster size, reusable link, staff safety review.
- **Participation shape** — one family, one child, one card, isolated
  session, deferred payment commitment.
- **Tier pricing model** — single/multi/squad thresholds with a free
  coach card at the top tier. Only the threshold value and currency
  changed (see below); the engine's shape is untouched.
- **Payment-after-close (Model 3)** — one payment request at the final
  confirmed tier, board-as-payment-surface, fixed price-tier variants
  through the existing cart-permalink + HMAC webhook rails.
- **The board mechanic** — gallery of completed cards, price ladder,
  completion checkmarks, nudge-the-group-chat loop. Nothing football
  about it.
- **Privacy posture** — first name + initial, link-gated, no photos on
  shared surfaces, organiser-seeded roster, aggregates-only dashboards.

## Sport-specific layer (changed, as ADR-7 designed)

| Concern | Football (UK) | Hockey (Canada) |
|---|---|---|
| Positions | GK/RB/CB/LB/CDM/CM/CAM/RW/LW/ST | Goalie/Defence/Left Wing/Centre/Right Wing |
| Stats | Apps/Goals/Assists | Skaters: GP/G/A/P · Goalies: GP/SV%/GAA |
| Squad-tier threshold | 10 (football squad) | 12 (hockey rosters run 15–19) |
| Group-share channel wording | "parent WhatsApp group" | "team group chat" (WhatsApp less dominant in CA) |
| Delivery framing | "to your organiser" | "to the rink" |
| Age structure | U10 age group | U11 + division letter (U11 A) |

## Findings (gaps to close for a real port)

1. **`CardFaceData.sport` union has no `'hockey'`** — currently
   `'baseball' | 'basketball' | 'soccer' | 'football'`. One-line type
   change plus a CardArt stat-panel variant. Exactly the kind of typed
   definition ADR-7 said should exist per sport.
2. **Goalies break the single-stat-schema assumption.** Football has one
   stat vocabulary for all positions; hockey needs per-position stat
   sets (skater vs goalie). Recommendation: stat schema keyed by
   position group, not by sport alone.
3. **No hockey card template asset exists.** The preview uses a CSS
   concept design. A real port needs template artwork through the same
   manifest pattern as hollinwood/EMJFL.
4. **Currency/tax localisation is market-level, not sport-level.** CAD
   pricing and province-based tax are properties of a *market* (like the
   UK/GBP work on the Shopify side), confirming market and sport are
   independent axes — worth keeping separate in any future schema.
5. **Squad-tier threshold wants to be a campaign parameter**, not a
   constant: 10 fits football, 12+ fits hockey. The pricing engine's
   "distinct paid participations" input already supports this; only the
   threshold constant is football-shaped.

## What a real port would require (in ADR order)

- Phase 1-style: `sport` on campaign/team records; positions + stat
  schemas as typed per-sport definitions; seasons unchanged.
- Pricing engine: keep version-pinned engine, add a market/currency
  dimension and a per-campaign tier threshold.
- Templates: one hockey template through the existing manifest pattern.
- Commerce: CA Shopify market (or store) with CAD tier variants — the
  same three-variant permalink + webhook approach proven in the UK.
- Compliance: PIPEDA replaces UK GDPR/ICO analysis; same
  children's-data posture, different statute — specialist review, not
  an engineering pass.

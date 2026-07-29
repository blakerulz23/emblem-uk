# Handoff brief — read this first

You're picking up work on **Emblem OS**, mid-build. This file exists so you don't
have to re-derive context from git history alone. Written 2026-07-22.

## The two-product split (important, don't conflate these)

There are **two separate products** both using the "Emblem" name:

1. **This repo (`emblem-uk`)** — the real product going forward. UK-grassroots-
   football-specific rebuild: NFC card → digital player profile, real claiming
   architecture, GBP pricing, Vercel project `emblem-uk` under team
   `lauda-collectives-projects`.
2. **`youthcards`** (separate repo, NOT this one) — the original codebase,
   generic AI/NFC custom-merch product, still **live in production** at
   `www.emblem.cards` with real paying customers, USD pricing, on a
   **different Vercel project**. Matt owns that domain/Shopify store; there's
   an unresolved verbal 50/50 revenue-split agreement on it.

**Standing rule, non-negotiable: never take any action (DNS, Vercel config,
domain settings) that could disrupt the live `emblem.cards` merch site.**
Additive changes (new TXT records, new subdomains) are fine; anything
touching root A/CNAME records needs explicit sign-off from Blake first. If
you're not sure which product a task affects, ask before touching
infra/domain config.

## Who's who

- **Blake** — founder, non-engineer, product/business decisions, final sign-off
  on architecture.
- **Matt** — engineer, has built everything shipped so far (see git log),
  has Vercel + Supabase + AWS access, generally works via PRs to `main`.
- You (Codex) — picking up engineering work alongside/after Matt.

## Architecture — read before writing code

The full architecture record (ADRs, invariants, phased roadmap, dependency
graph) was produced as a planning document called the **"Platform
Architecture Roadmap."** It is not checked into this repo as a file — it's an
external artifact Blake has as a PDF. The load-bearing decisions from it,
condensed:

### Approved ADRs
- **ADR-1**: scoped membership model (guardians/coach_team relationships
  stay as-is, not touched by the rebuild).
- **ADR-2**: club ↔ league is many-to-many.
- **ADR-3**: outbox pattern for events, transport TBD — Matt's default
  proposal is a polled events table (not a message queue). Not yet built.
- **ADR-4**: email-only notifications for v1 + a preferences model, built now.
- **ADR-5**: seasons are a real entity; card replacement/reissue deferred.
- **ADR-6**: **mandatory staff authentication.** Not yet built — see
  "Known gap" below.
- **ADR-7**: football-first but sport-agnostic primitives where practical;
  mechanism is a `docs/sport-extensibility-review.md` doc (not yet written).

### Phased roadmap (0–11)
Phase 0 (bug fixes) → Phase 1 (identity/membership model, Collection
OS/seasons) → Phase 2 (permissions + the staff-auth fix) → Phase 3 (IA/nav)
→ Phase 4 (event architecture/outbox) → Phase 5 (notifications) → Phase 6a/6b
(invitation orchestrator, split per Matt's own refinement) → Phase 7+ (Club
OS, League OS, analytics, commerce, public APIs, AI).

**Status: only Phase 0 is done.** Phase 1/2/4/6a/6b are approved but zero
implementation has started.

### Core data model — claimable cards
```
players (identity)
  ← cards (claim_token, player_id, order_id nullable, status: unassigned/assigned/claimed)
    ← orders (payment_status: order_intent → pending_payment → paid → cancelled → fulfilled)
```
- A card with no `order_id` is immediately claimable.
- A card tied to an order requires `orders.payment_status === 'fulfilled'`
  before it's claimable (Decision C: the Shopify webhook sets `'paid'`, not
  `'fulfilled'` — that's reserved for a real shipment event; the legacy
  manual `/api/orders/[id]/approve` endpoint still sets `'fulfilled'` and is
  flagged for alignment once Blake signs off).

### Two invitation mechanisms (now connected — see commit `e94d1cc`)
- **Claim-code flow** — canonical, offline-capable fallback.
  `/api/os/claim`, `src/app/os/overlays/ClaimCodeEntry.tsx`.
- **Email invite** — `src/lib/create-guardian-invite.ts` +
  `/api/os/invites` (POST) + `/api/os/invites/redeem` (GET/POST), sent via
  Resend. Originally only used for second-guardian invites; as of the most
  recent commit, also fires when a coach adds a player with a parent email
  (`src/app/os/screens/CoachTeam.tsx`), reusing both primitives unmodified.
  The claim code is always generated as the fallback regardless of whether
  the email send succeeds.

### Terminology discipline (used in code comments/docs, keep consistent)
Purchaser / Delivery contact / Collection manager / Intended claim recipient
/ Verified guardian (only correct post-acceptance). `intended_guardian_email`
is a real column name — don't rename it casually, and don't use that phrase
as a UI label (it's a DB-only term).

## Known gap: staff auth (the most urgent unfinished thing)

`/staff/queue` and `/api/orders/[id]/approve` currently have **no
authentication at all**. Real orders with real money are already flowing
through the single-card Shopify checkout path. This is a live risk, not a
future one. ADR-6 mandates fixing this, but it's scoped under Phase 2, which
depends on Phase 1's membership model landing first. **Recommendation given
to Matt: treat Phase 1 as the fastest path to closing this gap, not as an
abstract architecture task** — i.e. prioritize Phase 1 → Phase 2 ahead of
other backlog items.

## What's actually shipped and verified working (as of this repo's HEAD)

- Phase 0 fixes: real team/coach data in real mode (`Team.tsx`,
  `CoachHome.tsx`), fixed Add Moment submit flow (`OsApp.tsx`,
  `AddMomentFlow.tsx`), `Card.tsx` teaser routing.
- PWA manifest (`public/manifest.json` + `layout.tsx` metadata).
- Shopify `orders/paid` webhook (`src/app/api/webhooks/shopify/orders-paid/route.ts`,
  HMAC-verified via `src/lib/shopify-webhook.ts`) — replaces manual approval
  for the happy path, sets `payment_status = 'paid'`.
- `/pricing` route redirect to the homepage's real pricing section
  (`next.config.mjs`) — fixed a live brand/pricing contradiction.
- Coach-adds-player → email invite wiring (`CoachTeam.tsx`, commit `e94d1cc`).
- AWS S3 bucket env var (`AWS_S3_BUCKET`) confirmed correctly scoped to
  Production/Preview/Development on Vercel (was Development-only, silently
  broke team-order asset uploads in production; fixed, verified via
  `vercel env ls`).
- Resend email end-to-end (sign-in OTP codes + guardian invite emails) —
  was broken due to a stale, domain-restricted Supabase SMTP API key; fixed.

## Not yet started (but designed/approved — ready to build)

- Phase 1: identity/membership model, Collection OS/seasons.
- Phase 2: permissions model + the staff-auth fix (see "Known gap" above).
- Phase 4: event architecture/outbox (Matt's proposed default: polled
  events table).
- Phase 6a/6b: invitation orchestrator core + edge cases.
- `docs/sport-extensibility-review.md` (ADR-7's mechanism — doesn't exist yet).
- 7-day abandoned-order cleanup cron (no cleanup/cron files exist yet).
- Checkout/review-step UI rebuild (Decisions A–E from a separate "Checkout &
  Review Engineering Brief," including a gift-copies checkbox Matt added) —
  fully specced, not built. This can run in parallel with the Phase 1/2 work;
  it doesn't depend on it.

## Explicitly out of scope right now / needs Blake, not engineering judgment

- **Supabase project canonicalization.** Production is `ksszgbcditlfimnfnzla`
  ("emblem-os", Frankfurt/`eu-central-1`). Matt separately provisioned a
  second project, `lxbvbipfzdsdoycwyeii` (London/`eu-west-2`), by mistake.
  Three options on the table (a/b/c — migrate to the London one now / stay on
  Frankfurt / something else); Blake hasn't decided yet. **Don't act on this
  without explicit instruction** — it's a real data-residency decision, not
  a code cleanup.
- Revenue-split question re: whether the verbal 50/50 on the original merch
  product extends to this rebuild — a Blake/Matt business conversation, not
  an engineering task.
- See `docs/matts-salvage-notes.md` for pieces Matt deliberately dropped or
  deferred from an earlier closed PR (guardian data export/delete API +
  `/os/settings` page for ICO right-of-access/erasure, `/os/privacy` +
  `/os/terms` drafts pending solicitor review, stale seed data, a
  moderation-gate endpoint that turned out redundant with the real
  `/api/os/moments/verify` approve/reject flow).
- See `docs/infra/s3-london-bucket-setup.md` and
  `docs/compliance/children-data-checklist.md` for the UK-children's-data
  compliance context (this product handles real children's data — treat
  compliance docs as load-bearing, not boilerplate).

## Working conventions already established on this repo

- Docs-only requests mean **no code changes** — Blake is explicit and
  literal about this distinction; don't "helpfully" start implementing
  during a planning/audit exercise.
- Before considering any fix done: `tsc --noEmit`, `next lint` (scoped to
  changed files), `npm run build`.
- Commit only when explicitly told to; push only when explicitly told to.
  Never bundle unrelated changes into one commit.
- Known dev quirk: running `npm run build` while `next dev` is already
  running corrupts `.next`'s cache (`Cannot find module './XXXX.js'`) —
  kill the dev server first, or restart it after.
- Vercel CLI is available and authenticated locally (`vercel env ls`, etc.)
  against `lauda-collectives-projects/emblem-uk` — useful for verifying
  actual deployed env var scope instead of guessing from `.env.local` alone.

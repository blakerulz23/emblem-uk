# Children's-data compliance checklist — Emblem OS

> **This is a draft for a solicitor or Data Protection Officer to review. It
> is not a compliance sign-off.** It maps this codebase's current state
> against the UK ICO's [Age Appropriate Design Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/)
> (the "Children's Code") so a reviewer can see exactly what's implemented,
> what's partial, and what's missing — before any real (non-test) child's
> data is stored in this system. Written as part of the Phase 0 foundation
> build (see the engineering audit's Phase 0 roadmap item).

## How to read this

Each Children's Code standard gets one entry: a plain-English description,
a status, and a pointer to where in the codebase that status comes from.

- ✅ **Addressed** — implemented, with the file/mechanism cited.
- 🟡 **Partial** — something exists but doesn't fully close the gap.
- ❌ **Not addressed** — no code exists for this yet.

## Standards

### Best interests of the child
🟡 **Partial.** The data model was designed around a real child having a
guardian relationship (`guardians` table, [0001_init.sql](../../supabase/migrations/0001_init.sql))
rather than treating the child as the account holder. But no one at Lauda
Collective has done a documented best-interests assessment — that's a
product/policy exercise, not something code can certify.

### Data minimisation
✅ **Addressed at the schema level.** `players` only stores name, position,
age, height, preferred foot, and the NFC card link — no address, school, or
other identifying detail beyond what the product actually displays. See
[0001_init.sql](../../supabase/migrations/0001_init.sql).

### Default privacy settings
✅ **Addressed.** Every table has Row Level Security enabled — a player's
data is only visible to their linked guardians and their team's assigned
coaches by default, with no way to opt into broader visibility yet (there's
no public-profile toggle in this build). Media URLs from
`getSignedDownloadUrl()` ([src/lib/s3-client.ts](../../src/lib/s3-client.ts))
are private, time-limited signed links, not public S3 URLs.

### Data sharing
✅ **Addressed for the moments in this build.** A coach can only read/write
players on teams they're assigned to (`coach_team` table); a parent can
only read/write players they're a guardian of (`guardians` table). No
third-party data sharing exists anywhere in this codebase.

### Geolocation
✅ **Not applicable.** Nothing in this codebase collects or stores location
data.

### Parental controls
🟡 **Partial.** The `guardians` table is the mechanism for parental control
over a child's data — a parent can see/act on their linked child's record.
There is no in-app UI yet for a parent to review what's stored, export it,
or manage a second guardian's access (the schema supports multiple
guardians per player, but no UI surfaces that).

### Profiling
✅ **Not applicable.** `player_skill_snapshots` are coach-entered
assessments, not behavioural profiling or automated decision-making — see
[scoring.ts](../../src/app/os/scoring.ts)'s explicit product rule that
scores are coach-assessed, never algorithmically inferred from usage data.

### Nudge techniques
✅ **Addressed as a product rule, not just a policy.** The Skills/Development
rework's explicit rules (no XP, no levels, no coins, no public child
leaderboard) were a deliberate rejection of engagement-maximising design
patterns aimed at children. See [playerProfile.ts](../../src/app/os/playerProfile.ts)'s
doc comment and the product brief it was built from.

### Connected toys and devices
✅ **Not applicable in this build.** The NFC card is a passive identifier
(`players.card_nfc_id`) — it doesn't collect data itself. No other
connected-device integration exists.

### Online tools
❌ **Not addressed.** There's no in-app support for a child to raise a
privacy concern, flag content, or contact a trusted adult about something
they've seen in the app. Not built in Phase 0.

### Data retention & the right to erasure
❌ **Not addressed.** No retention policy or deletion job exists — a
guardian or coach cannot yet delete a player's record, moments, or media
through the product. `on delete cascade` is set at the database level
(deleting a `players` row cascades to their moments/media/snapshots), so
the mechanism to *build* erasure on top of exists, but nothing in the app
triggers it yet.

### Age-appropriate application
🟡 **Partial.** The child (the player) isn't the account holder in this
build — accounts belong to `profiles` (parent or coach), and the schema
assumes a parent manages the child's data on their behalf rather than the
child interacting with sign-in/consent flows directly. This side-steps
several Children's Code requirements aimed at a *child* using the service
directly, but a reviewer should confirm this framing is actually correct
for Emblem's real usage pattern (e.g., do older children use the app
themselves at some age band?).

### Transparency
❌ **Not addressed.** There's no privacy notice or terms specific to
Emblem OS in this build (the main marketing site's privacy/terms pages,
fixed during the Emblem/Youthcards work, don't cover the OS product's data
handling). Needed before real data flows.

## What this checklist does not cover
- Whether Lauda Collective's actual data processing agreement with AWS
  (S3) and Supabase meets UK GDPR requirements for a data processor
  handling children's data — that's a contracts question, not a code one.
- Age verification / consent-gathering mechanics for a parent creating an
  account on a child's behalf — not built, and genuinely a legal design
  decision (e.g., what counts as sufficient parental consent) before it's
  implementable.
- Anything about the physical NFC card supply chain or the print-order
  pipeline's data handling (out of scope for Emblem OS specifically).

## Before any real child's data touches this system
1. Get this document in front of an actual solicitor or DPO.
2. Write the actual privacy notice/terms this checklist's "Transparency"
   gap calls out — needs legal input, not just an engineering pass.
3. Decide the retention/erasure policy this checklist's "❌ Not addressed"
   items flag, then build the deletion flow against it.

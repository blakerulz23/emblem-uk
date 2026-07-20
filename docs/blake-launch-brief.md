# Emblem OS launch brief — for Blake

**One page. What Matt did, what you need to do, in order.**

_Written after Matt provisioned Supabase (London), reviewed the audit,
merged the moderation gate + compliance drafts, and shipped the
guardian data-management surface. Everything below is what closes
Phase 0 in the audit + the ❌ items in the compliance checklist that
code can close (i.e. everything except "get a solicitor's signature")._

---

## What's landed on `main`

Merge PR #? (branch `feat/moderation-and-compliance-drafts`) — a single
commit `4313959` followed by a follow-up commit with the settings page
+ export/delete endpoints + PWA manifest + S3 London runbook.

- **Moderation gate** (audit HIGH closed): parent moments now start
  `status='pending'`; coach approval via `POST /api/os/moments/[id]/moderate`
  flips them to `approved`. `CoachVerify.tsx` wires the buttons and
  queries real rows.
- **Guardian right-of-access** (`❌ → ✅ code side`): `GET /api/os/guardian/export/[playerId]`
  returns full JSON export with 1-hour signed media URLs.
- **Guardian right-to-erasure** (`❌ → ✅ code side`): `DELETE /api/os/guardian/delete-player/[playerId]`
  with a `confirmName` body deletes the player and cascades to moments,
  media, and snapshots. S3 objects survive until the async sweeper
  runs (TODO).
- **Guardian settings surface** at `/os/settings` — plain page with a
  Download + Delete button per linked player.
- **PWA manifest** — `public/manifest.json` + `layout.tsx` reference.
  Add the icon PNGs and you get an installable app.
- **Compliance drafts** — `/os/privacy`, `/os/terms`, and
  `docs/compliance/solicitor-request-email.md` for you to send.
- **Test seed** — `supabase/seed.sql` + `supabase/seed_link_me.sql`.
- **Runbook** — `docs/infra/s3-london-bucket-setup.md`.
- **Two migrations** added: `0003_moderation.sql`, `0004_guardian_erasure.sql`.

---

## Your queue, ordered

### 1. Set Vercel env vars on `emblem-uk` (5 min)

From the 1Password item Matt shared (`Emblem OS — Supabase (Production)`
+ `Emblem OS — AWS`), paste these on the emblem-uk Vercel project,
Production + Preview scope, mark the two secrets as Sensitive:

```
NEXT_PUBLIC_SUPABASE_URL       https://lxbvbipfzdsdoycwyeii.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  eyJ...
SUPABASE_SERVICE_ROLE_KEY      eyJ...           [Sensitive]
AWS_REGION                     ap-southeast-2   (see step 5 below to move to eu-west-2)
AWS_S3_BUCKET                  youthcards-print-files
AWS_ACCESS_KEY_ID              AKIA...
AWS_SECRET_ACCESS_KEY          ...              [Sensitive]
```

Then trigger a redeploy so it picks them up.

### 2. Merge the PR + run the two new migrations (5 min)

Merge branch `feat/moderation-and-compliance-drafts` into main. Then
in the Supabase SQL Editor (project `lxbvbipfzdsdoycwyeii`):

- Run `supabase/migrations/0003_moderation.sql`
- Run `supabase/migrations/0004_guardian_erasure.sql`
- Optionally run `supabase/seed.sql` for the test player

### 3. Add Matt as a Vercel collaborator on `emblem-uk` (30 sec)

Vercel → emblem-uk → Settings → Members → Invite → `mattchokorea@gmail.com`.
This means we can share env-var management, redeploys, and runtime-log
debugging without you being the single point of contact.

### 4. Send the compliance email (5 min)

Open `docs/compliance/solicitor-request-email.md`, fill the brackets,
attach the three files it lists, send. If Lauda Collective already has
a solicitor on retainer, prefer them; otherwise the DPO Centre or GRCI
Law both handle children's-data reviews.

**No real family data collects until you have their signed-off response.**

### 5. Move the S3 bucket to London (30 min AWS work)

Follow `docs/infra/s3-london-bucket-setup.md` end to end. Create the
`emblem-uk-moments-prod` bucket in `eu-west-2`, generate a scoped IAM
user, swap the four AWS env vars on Vercel. Redeploy. This is the
biggest remaining compliance-adjacent item.

### 6. Pick a transactional email provider (10 min)

Notifications aren't wired yet (audit HIGH). Two candidates:

- **Resend** (recommended) — dev-friendly, £0/month up to 3k emails, fast.
- **Postmark** — better deliverability rep for transactional.

Sign up, create an API key, add as `EMAIL_API_KEY` (or provider-specific
name) on Vercel. Matt can wire the actual send calls in the next commit
once you name the provider.

### 7. First-run smoke test (10 min)

Once steps 1-3 are done:

1. Open `https://emblem-uk.vercel.app/os` in a private window
2. Sign in with a real email (you'll get a 6-digit code)
3. Pick Parent role
4. In Supabase SQL Editor, run `seed_link_me.sql` with your email filled in
5. Refresh — you should see "Test Kid Testerson" as your player
6. Add a moment (photo + title)
7. Confirm it saved to `moments` table with `status='pending'`
8. Confirm the media file landed in the S3 bucket
9. Toggle to Coach role (it seeded both links)
10. Go to Verify — the pending moment should be there
11. Click Approve — confirm status flips to `approved` in DB
12. Try `/os/settings` — Download should return a JSON blob; Delete
    should require typing "Test Kid Testerson" to confirm

If every step passes: Phase 0 is real. If any step fails, drop a note on
the PR and I'll fix.

---

## Not touched yet (deliberate; needs your input)

- **Journey.tsx / Squad view / coach activity feed** still read the
  demo `MOMENTS`/`SQUAD` constants, not real DB rows. Straightforward
  rewrite but wanted your product opinion on the empty-state design
  before I do it. Should the parent's Journey read all their child's
  moments including pending ones (with a "awaiting coach review" tag)?
- **Async S3 sweeper** for orphaned media files after a guardian
  deletes a player. One cron job (Vercel Cron or Supabase pg_cron) —
  30 min work once we agree on the schedule.
- **Retention policy** — the erasure UI is there but there's still no
  automatic retention/expiry rule. That's a legal/product decision
  before it's a code one.
- **PWA icons** — `public/manifest.json` references `/icon-192.png`,
  `/icon-512.png`, `/icon-maskable-512.png`. Add these when you have
  the icon assets ready.
- **Web NFC vs native wrapper** — the audit's Phase 3 highest-leverage
  decision. Deserves its own thread.

---

## Non-blockers, but worth knowing

- No tests yet. `vitest` is not in the tree — happy to scaffold it
  next after we're deployed.
- No status monitoring / Sentry equivalent yet.
- The 1Password vault name Matt used is `Emblem OS — Supabase (Production)`;
  the AWS one is `Emblem OS — AWS` (once he creates it during step 5
  above).

---

_Questions or things I got wrong: drop them on the PR or ping Matt._

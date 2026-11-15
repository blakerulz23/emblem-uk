# Photo Day — design v0.1

**Status:** draft for Blake's review. Phases 1 (schema), 2 (staff, photographer upload, matching) and 3 (parent permission, publishing, own-child picker) written; nothing applied to any real database.
**Date:** 15 November 2026
**Branch:** `feat/photo-day` (worktree `emblem-uk-photo-day`, based on production `794d183`)

## Why

On 15 November 2026 Blake visited Astley Sports Village (Dukinfield), a busy Sunday junior football hub, and saw no matchday photographers. The Saddleworth 3Ds secretary was interested in a matchday photo pilot, said it needs both coaches' permission, and suggested rolling it out across the East Manchester Junior Football League (EMJFL) afterwards. Emblem Canada/US already has a photographer-led team gallery (`emblem-ca` `/team-cards/[id]`). This brings the same idea to the UK.

## Decisions (Blake, 15 Nov 2026)

1. **Built inside Squad Invite**, not as a separate gallery. Photo Day is an option on a Squad Invite campaign.
2. **Start building now**, alongside a manual Saddleworth pilot.
3. **A hired photographer** takes the photos. They get upload-only access, never a staff account.

## Flow

1. **Organiser** creates a Squad Invite and chooses Photo Day (date, venue). Staff approve the campaign as today.
2. **Staff** confirm on the record that both coaches gave permission for matchday photography (`coach_permissions_confirmed_at`). Uploads are blocked until then.
3. **Parents** join through the usual invite link. Before the shoot, they grant a new, separate permission, `photo_day_photography`. Children without it are not matched, and the photographer is briefed to avoid them where possible.
4. **The photographer** opens a private, expiring upload link (`/photo-day/upload/[id]#token`) and uploads the shoot. The link can only add photos to that one photo day, capped at `max_photos`.
5. **Staff** match photos to children whose parents consented (`match_photo_day_photo`, which checks consent in the same database transaction).
6. **Parents** open the builder from their participation and see **only their own child's matched photos**, with the card already made. They approve it or pick another of their child's shots. Nothing about other children is shown.
7. From commitment onwards, everything is unchanged: commitment, deadline pricing, Shopify payment, the coach card and consolidated delivery.

## What we take from the US build, and what we leave out

| Taken | Left out, and why |
|---|---|
| Token in the URL `#fragment`, stored only as a SHA-256 hash | Whole-shoot browsing: it would show parents other people's children |
| Expiring access for photographer and gallery | AI jersey-number matching: by hand is fine for squads of about 15 (revisit at league scale) |
| Server-side card rendering (no browser-supplied artwork) | 5-card packs and WESTSIDE designs (US-specific) |
| Photo request form idea | "Expired" meaning hidden-only: UK deletes the stored files (Phase 4) |
| Staff review before anything reaches parents | Shared-permission tickbox instead of parent consent |

## Data model (migration 0104)

- `squad_invite_permissions.purpose` gains `photo_day_photography`.
- `squad_invite_photo_days`: one per campaign. Holds status (`scheduled → shooting → matching → published → closed`, or `cancelled`), date, venue, photographer name, the token hash and its expiry, the coach permission confirmation, the photo cap, `photos_delete_after` and `photos_deleted_at`.
- `squad_invite_photo_day_photos`: storage key (`photo-day/{dayId}/{uuid}.jpg|png|webp`), size, match (participation, staff member, time) and `deleted_at`. Erasing a participation deletes its photo rows.
- Functions (service role only, `security definer`, empty `search_path`):
  - `record_photo_day_photo`: checks the token, expiry, status and coach permission, then caps the count.
  - `match_photo_day_photo`: checks the staff member, the campaign, that the participation is open, and that consent is granted and not withdrawn.
  - `unmatch_photo_day_photo`.
  - `release_photo_day_photos_for_withdrawn_consent`: run when a parent withdraws, so their child's photos are unmatched straight away.
- RLS is on, and `anon`/`authenticated` have no access, matching every Squad Invite table.

**Separate fix found while doing this (migration 0103, branch `fix/restore-squad-invite-audit-events`):** 0081 dropped five audit event types that functions still write. As a result, coach card submit/lock/request-changes, staff photo rejection and campaign reopen fail on any database where 0081 is applied. 0103 restores them. **Ship this first, on its own.** To confirm against production (read-only):

```sql
select pg_get_constraintdef(oid) from pg_constraint
where conname = 'squad_invite_audit_events_event_type_check';
```

## Phases

| Phase | Scope | State |
|---|---|---|
| 1 | Design (this doc), DPIA note, migration 0104 and contract test | **Written, tested in in-memory Postgres, not applied** |
| 2 | Staff: create photo day, issue/revoke photographer link, confirm coach permission. Photographer upload route (S3 London, `photo-day/` prefix). Staff matching page | **Written, tested, not applied or deployed** |
| 3 | Parent: consent step in join flow, own-child photo picker in builder, card prefilled. Also writes the child's first name, surname initial and squad number (phase 2 note 4). Adds staff publishing | **Written, tested, not applied or deployed** |
| 4 | Retention: cron deletes S3 objects and marks rows after `photos_delete_after` (proposed: 30 days after the campaign closes, never more than 60 days after the shoot); **erasure flow unmatches and deletes Photo Day photos** (phase 3 note 6); **sweep `photo-day/` for objects with no row** (phase 2 note 6); staging rehearsal; release | Next. **Release blocker** |

## Phase 2 (15 November 2026)

**Migration 0105** adds four staff functions. Each one checks the staff member, locks the photo day row and writes its own audit event in the same transaction: `create_squad_invite_photo_day`, `confirm_photo_day_coach_permissions`, `issue_photo_day_photographer_link` and `revoke_photo_day_photographer_link`. Two audit event types are added.

| Where | What |
|---|---|
| `/staff/squad-invites/[reference]` | New Photo Day panel: add the day, record how both coaches agreed, issue/replace/revoke the link (shown once, with a copy button), counts, link to matching |
| `/staff/squad-invites/[reference]/photo-day` | Matching: 48 photos per page (unmatched / matched / all), 15-minute signed previews, a "Who is this?" list of children with permission, and a photo count per child |
| `/photo-day/upload/[id]#token` | Photographer page: link check, reminders (cull, no changing rooms, wipe after), multi-file upload two at a time, retry failed |
| `POST /api/staff/squad-invites/[id]/photo-day` (+ `/coach-permission`, `/photographer-link`, `/photos/[photoId]/match`) | Staff routes. Same-origin check; Approver for create, coach permission and link; Reviewer for matching |
| `GET/POST /api/photo-day/[id]/upload` | Bearer token in the `Authorization` header (never in a URL); rate-limited by IP and photo day; one photo per request |

Behind `SQUAD_INVITE_MVP_ENABLED`, like the rest of Squad Invite (middleware path families `/photo-day` and `/api/photo-day`).

**Notes and decisions made while building:**

1. **Upload size.** Vercel caps a function's request body at about 4.5 MB. Camera JPEGs are often bigger, so the photographer page resizes each photo in the browser (longest edge 3,200 px, at most 4 MB). The server then re-encodes it with sharp: it applies orientation, caps the size, and **drops all metadata (EXIF, GPS, camera serial)**. Every stored photo is a `.jpg`. A printed card needs about 1,100 px, so nothing useful is lost. Direct-to-S3 presigned uploads would avoid the limit, but they need bucket CORS changes that can't be tested without AWS credentials.
2. **The link** is a fresh 32-byte token. Only its SHA-256 is stored, and the audit event never contains it. It lasts 24 h, 48 h, 3 days or 7 days (the database refuses more than 7 days). It is refused until coach permission is confirmed. Issuing a new link kills the old one at once. A wrong token and an unknown photo day get the same answer.
3. **Matching the first photo closes uploads** (0104 moves the day from `shooting` to `matching`, and only `scheduled`/`shooting` accept uploads). The panel and the matching page warn about this. If Blake wants uploads and matching to overlap, it's a one-line change in `record_photo_day_photo`.
4. **How staff tell children apart.** Before commitment, a participation has no child name: `display_first_name`, `display_surname_initial` and `squad_number` are only written at commitment, but matching only accepts `started` participations. The matching page labels children from those same three columns, which the 0076 erasure flow already clears, so no new copy of a child's name is created. Until phase 3 fills them in, a child shows as "Child 2 (name not given yet)". **Phase 3's consent step must write them.** Squad number is the practical key, because shirt numbers are visible in photos.
5. **One photo day per campaign, with no edit.** A wrong date or venue needs a correction function (not built). Staff can still revoke the link.
6. **Orphans.** If the database refuses an upload after the object is stored (link revoked mid-upload, cap reached), the route deletes the object. If that delete also fails, an object is left with no row. The phase 4 cron should sweep `photo-day/{dayId}/` for keys with no row.

## Phase 3 (15 November 2026)

**Migration 0106** adds two functions:
- `record_photo_day_consent` lets a parent grant, decline or withdraw. It proves ownership with the signed-in guardian **and** the httpOnly builder credential, as the commit RPC does.
- `publish_photo_day` lets staff release photos to parents. Three parent audit event types are added.

| Where | What |
|---|---|
| `/squad-invite/join` | After verification, if the team has a scheduled photo day and the parent hasn't chosen yet: a Photo Day step (what happens, who sees what, deletion, how to withdraw), a yes/no choice, and on yes the child's first name, surname initial and shirt number |
| `/builder?squadParticipation=…` | On the photo step: the child's own matched photos once published, tap one to use it, and "Withdraw Photo Day permission". The shirt number pre-fills the card |
| `/staff/squad-invites/[reference]/photo-day` | "Publish to parents" (Approver), shown while matching. Before the shoot, the permission list is labelled as the photographer's shoot list |
| `POST /api/squad-invite-participations/[id]/photo-day-consent` | Parent choice. CSRF double-submit, rate-limited |
| `GET /api/squad-invite-participations/[id]/photo-day-photos/[photoId]` | Same-origin, ownership-checked photo proxy (the builder draws on a canvas, which a cross-origin S3 URL would block) |
| `POST /api/staff/squad-invites/[id]/photo-day/publish` | Staff publish |

**Notes and decisions made while building:**

1. **Parents see nothing until staff publish.** Phase 2 moved straight from matching to parents. Publishing adds a deliberate Approver step, so a match staff are still checking is never shown to the wrong family. Publishing also kills the photographer link and stops new matches. Unmatching still works afterwards, to correct a mistake.
2. **Permission can only be given before the shoot** (photo day still `scheduled`, so no upload yet). The photographer culls children without permission at the shoot, so permission given afterwards could never produce photos. Declining and withdrawing work at any time while the card is open.
3. **Withdrawing** unmatches the child's photos at once, clears the name and shirt number given for matching, and removes a Photo Day photo already placed on the card in the builder. The parent's own uploads are left alone. Once the card is committed, permission can't be changed from the builder; the parent must contact Emblem.
4. **The chosen photo goes through the builder's own path.** The picker hands the photo to the builder as if the parent had uploaded it. Crop, background removal, the upload to the participation's own `order-assets/` space at commit, and printing are all unchanged; the shared upload step is untouched (enforced by `squad-invite-builder-integration-contract.test.ts`). From that point the card photo is covered by the existing `photograph_manufacture` permission and the existing card retention. The photographer's original is still deleted on the Photo Day schedule.
5. **Organiser dashboard fix.** It listed any participation with a first name as "joined", relying on names being written only at commitment. Photo Day permission now writes a name earlier, so the list explicitly excludes `started` participations.
6. **Erasure gap (phase 4).** The 0076 erasure flow clears the participation's name columns but doesn't yet unmatch or delete Photo Day photos matched to that child. Phase 4 must add both.
7. **Shoot list.** Blake shoots, and he is staff, so the permission list on the matching page is the shoot list. A hired photographer would need a printable list. Not built.
8. **Not auto-placed.** The card isn't silently made from the first photo: the parent taps the one they want. Doing it automatically would race the restore of a saved draft and could overwrite a photo the parent already chose.

## Verification limits

- Migrations 0103–0106 apply in order, and their behaviour is checked against real Postgres in an in-memory PGlite database (`supabase/tests/0104_0105_photo_day_pglite_test.mjs`, 121 checks). Covered: privileges, create rules, coach-permission gate, link issue/replace/revoke/expiry, upload cap and prefix, consent-gated matching, and withdrawal release. Phase 3 adds: ownership by guardian and builder credential, child-detail validation, grant only before the shoot, decline and withdraw, publish rules, and withdrawal clearing details and matches. PGlite isn't Supabase, so the migrations must still be applied and exercised on staging before production.
- Real S3 upload/delete can't be tested locally (no AWS credentials). The upload route is tested with storage mocked and real sharp re-encoding. Phase 2 and 4 storage paths need the staging rehearsal.
- No page was driven in a browser: the staff pages need a staff login and a database, and the only database `.env.local` points at is production. `next build` passes.

## Decisions recorded 15 November 2026 (Blake approved)

1. **Retention:** every photo, matched or not, is deleted 30 days after the campaign closes, and never later than 60 days after the shoot. Phase 4 enforces this.
2. **Photographer:** Blake is the photographer for the first photo days, as Emblem itself, so no third-party processing agreement is needed yet. Rules for whoever shoots: no copies kept outside Emblem storage; memory cards and camera wiped after upload; the club welfare officer told before the shoot. A data-processing agreement is required before any hired photographer is used. A DBS check for Blake is recommended, since clubs commonly ask for one.
3. **Children without consent:** frames showing a child without `photo_day_photography` consent are **not uploaded**. They are culled on the camera or laptop before upload. No blurring tool is built.
4. **Social media:** any social post of pilot photos, including a free Saddleworth 3Ds pilot, needs separate written consent from each parent, per child, per use. `photo_day_photography` covers card manufacture only.

5. **Pricing:** Photo Day uses Squad Invite pricing unchanged (£18.99 at 10+ commitments, £21.99 at 2–9, £24.99 for 1; free coach card after 10 paid). No pricing code changes.

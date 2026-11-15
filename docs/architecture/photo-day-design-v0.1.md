# Photo Day — design v0.1

**Status:** draft for Blake's review. Phase 1 (schema) written; nothing applied to any database.
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
| 1 | Design (this doc), DPIA note, migration 0104 and contract test | **Written, static tests pass, not applied** |
| 2 | Staff: create photo day, issue/revoke photographer link, confirm coach permission. Photographer upload route (S3 London, `photo-day/` prefix). Staff matching page | Next |
| 3 | Parent: consent step in join flow, own-child photo picker in builder, card prefilled | |
| 4 | Retention: cron deletes S3 objects and marks rows after `photos_delete_after` (proposed: 30 days after the campaign closes, never more than 60 days after the shoot); erasure flow deletes the objects; staging rehearsal; release | |

## Verification limits

- No local Postgres is available in this environment, so migrations 0103 and 0104 are **statically checked only** (contract tests). They must be applied and exercised on staging before production.
- Real S3 upload/delete can't be tested locally (no AWS credentials). Phase 2 and 4 storage paths need the staging rehearsal.

## Decisions recorded 15 November 2026 (Blake approved)

1. **Retention:** every photo, matched or not, is deleted 30 days after the campaign closes, and never later than 60 days after the shoot. Phase 4 enforces this.
2. **Photographer:** Blake is the photographer for the first photo days, as Emblem itself, so no third-party processing agreement is needed yet. Rules for whoever shoots: no copies kept outside Emblem storage; memory cards and camera wiped after upload; the club welfare officer told before the shoot. A data-processing agreement is required before any hired photographer is used. A DBS check for Blake is recommended, since clubs commonly ask for one.
3. **Children without consent:** frames showing a child without `photo_day_photography` consent are **not uploaded**. They are culled on the camera or laptop before upload. No blurring tool is built.
4. **Social media:** any social post of pilot photos, including a free Saddleworth 3Ds pilot, needs separate written consent from each parent, per child, per use. `photo_day_photography` covers card manufacture only.

5. **Pricing:** Photo Day uses Squad Invite pricing unchanged (£18.99 at 10+ commitments, £21.99 at 2–9, £24.99 for 1; free coach card after 10 paid). No pricing code changes.

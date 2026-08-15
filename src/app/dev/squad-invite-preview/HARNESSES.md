# Squad Invite database-free journey harnesses

Two development-only routes for exercising real Squad Invite interactive
components without a database:

- `/dev/squad-invite-preview/organiser-harness`
- `/dev/squad-invite-preview/staff-review-harness`

## Properties true of both

- **Development-only.** Gated by the same `isSyntheticSquadInvitePreviewEnabled()`
  check as the sibling `SquadInvitePreview` route (`squad-invite-preview-mode.ts`):
  hard-disabled in production, requires an explicit flag on Preview, requires
  `NODE_ENV=development` locally. Both routes 404 outside development.
- **Synthetic data only.** Every value rendered (organiser names, references,
  dates, declarations) is hardcoded or generated client-side. Nothing is
  read from or written to a real database.
- **No Supabase client.** Neither harness file imports `@supabase/*` or any
  of this repo's Supabase helpers, directly or transitively through what
  they import.
- **All unmocked `fetch` calls are blocked.** Each harness installs a
  `window.fetch` override before its component tree can call it. A small,
  explicit allow-list of paths returns a synthetic response; everything
  else — including any endpoint outside the intended journey — returns a
  blocked `403` and is logged to a `window.*NetworkLog` array. The original
  `fetch` is never retained or called from inside the override.

## Organiser harness

Imports and renders the real `OrganiserStart` component
(`src/app/squad-invite/start/OrganiserStart.tsx`) unmodified. Only its
network boundary is replaced: the three organiser-auth endpoints it calls
before reaching the review step (`context`, `request-code`, `verify-code`)
are answered synthetically so the component's own state machine can
progress; the real submission endpoint (`/api/squad-invite-requests`) is
never in the allow-list, so an accidental Submit click cannot reach it.

## Staff review harness

Imports and renders the real `ReviewActions` component
(`src/app/staff/squad-invites/[reference]/ReviewActions.tsx`) unmodified —
this is the actual interactive Start review / Request changes / Approve /
Reject control, including its real client-side status messaging.

The queue list and request-detail `<dl>` surrounding it are **not** the
real components. `src/app/staff/squad-invites/page.tsx` and
`[reference]/page.tsx` are Server Components that query Supabase inline as
part of the component body — there is no seam to inject synthetic data
without editing production source, which this harness does not do. Instead
the harness reproduces their markup and copy against a synthetic in-memory
record. Only the two endpoints `ReviewActions` calls in the intended
journey (`/review`, `/approve`) are mocked; `cancel-approval` and the
notification-resend endpoint are outside the allow-list and are blocked
like anything else.

## What these harnesses do **not** prove

- That the real `/api/staff/squad-invites/*` or `/api/squad-invite-*`
  routes behave correctly end-to-end.
- That the real Supabase queries in the staff queue/detail Server
  Components, or the RPCs those API routes call, are correct.
- That the real `squad_invite_staff_permissions` reviewer/approver
  authorization actually works — the permission rule the staff harness
  enforces is a hand-verified reproduction of what `review/route.ts` and
  `approve/route.ts` do, checked by reading that source, not by exercising
  the real database-backed check.

They prove the interactive React components' own logic and the app's
client-side handling of allow/deny responses — nothing that requires a
live backend.

import { notFound } from 'next/navigation';
import StaffReviewHarness from './StaffReviewHarness';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Staff Squad Invite Review Harness', robots: { index: false, follow: false } };

/**
 * Database-free harness for the Staff Squad Invite queue and review journey.
 * Same gating as the sibling organiser-harness (see its page.tsx) — inherits
 * the `/dev/squad-invite-preview` 404-outside-dev gate and the middleware's
 * Supabase-updateSession skip, no new exemption added.
 *
 * Unlike the organiser harness, the real queue/detail Server Components
 * (src/app/staff/squad-invites/page.tsx and [reference]/page.tsx) cannot be
 * imported directly — they run inline Supabase queries as part of the
 * Server Component body, with no seam to inject data. StaffReviewHarness
 * therefore reproduces their exact JSX structure and copy against a
 * synthetic in-memory record (see that file's own comment for what's a
 * faithful replica vs what's genuinely reused). ReviewActions.tsx — the
 * actual interactive review/approve component — IS imported unmodified,
 * exactly as OrganiserStart was in the organiser harness.
 */
export default function StaffReviewHarnessPage() {
  if (!isSyntheticSquadInvitePreviewEnabled()) notFound();
  return <StaffReviewHarness />;
}

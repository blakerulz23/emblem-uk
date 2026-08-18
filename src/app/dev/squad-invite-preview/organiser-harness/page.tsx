import { notFound } from 'next/navigation';
import OrganiserFormHarness from './OrganiserFormHarness';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Organiser Form Harness', robots: { index: false, follow: false } };

/**
 * Database-free harness for the real OrganiserStart component (see
 * squad-invite-preview-mode.ts and middleware.ts's `/dev/squad-invite-preview`
 * exemption — this route inherits the same 404-outside-dev gate and the same
 * Supabase-middleware skip, it does not add a new one). Renders the actual
 * production component, not a mock — only its network boundary is replaced.
 */
export default function OrganiserFormHarnessPage() {
  if (!isSyntheticSquadInvitePreviewEnabled()) notFound();
  return <OrganiserFormHarness />;
}

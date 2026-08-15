import { notFound } from 'next/navigation';
import HockeyCanadaPreview from '@/app/dev/hockey-ca-preview/HockeyCanadaPreview';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Emblem Canada Hockey Preview', robots: { index: false, follow: false } };

/**
 * Reuses the squad-invite synthetic-preview gate: preview deployments
 * only, flag-enabled only. Same reasoning — concept screens must never
 * be reachable on production.
 */
export default function HockeyCanadaReviewPage() {
  if (process.env.VERCEL_ENV !== 'preview' || !isSyntheticSquadInvitePreviewEnabled()) notFound();
  return <HockeyCanadaPreview />;
}

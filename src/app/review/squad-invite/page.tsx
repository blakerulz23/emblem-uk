import { notFound } from 'next/navigation';
import SquadInvitePreview from '@/app/dev/squad-invite-preview/SquadInvitePreview';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Squad Invite Product Preview', robots: { index: false, follow: false } };

export default function SquadInviteReviewPreviewPage() {
  if (process.env.VERCEL_ENV !== 'preview' || !isSyntheticSquadInvitePreviewEnabled()) notFound();
  return <SquadInvitePreview />;
}

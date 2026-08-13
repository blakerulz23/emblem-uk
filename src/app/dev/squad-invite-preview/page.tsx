import { notFound } from 'next/navigation';
import SquadInvitePreview from './SquadInvitePreview';
import { isSyntheticSquadInvitePreviewEnabled } from '@/lib/squad-invite-preview-mode';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Squad Invite Preview', robots: { index: false, follow: false } };

export default function SquadInvitePreviewPage() {
  if (!isSyntheticSquadInvitePreviewEnabled()) notFound();
  return <SquadInvitePreview />;
}

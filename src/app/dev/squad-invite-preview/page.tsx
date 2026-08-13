import { notFound } from 'next/navigation';
import SquadInvitePreview from './SquadInvitePreview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Synthetic Squad Invite Preview', robots: { index: false, follow: false } };

export default function SquadInvitePreviewPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.SQUAD_INVITE_PREVIEW_ENABLED !== 'true') notFound();
  return <SquadInvitePreview />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { isUuid } from '@/lib/photo-day';
import PhotographerUpload from './PhotographerUpload';

export const metadata: Metadata = {
  title: 'Photo Day upload · Emblem',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * The photographer's private upload page. The token is in the URL
 * #fragment and is read only by the browser; the page itself carries no
 * data until the token is checked by /api/photo-day/[id]/upload.
 */
export default function PhotoDayUploadPage({ params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled() || !isUuid(params.id)) notFound();
  return <PhotographerUpload photoDayId={params.id} />;
}

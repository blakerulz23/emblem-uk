import type { Metadata } from 'next';
import InvitationAccess from './InvitationAccess';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Open Squad Invite | Emblem',
  robots: { index: false, follow: false, nocache: true },
};

export default function InvitationAccessPage() {
  return <InvitationAccess />;
}

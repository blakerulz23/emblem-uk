import type { Metadata } from 'next';
import PaymentPreview from './PaymentPreview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Complete payment | Emblem',
  robots: { index: false, follow: false, nocache: true },
};

export default function SquadInvitePaymentPreviewPage() {
  return <PaymentPreview />;
}

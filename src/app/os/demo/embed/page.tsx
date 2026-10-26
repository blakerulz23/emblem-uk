import type { Metadata } from 'next';
import { Suspense } from 'react';
import OsApp from '../../OsApp';

/**
 * The public demo (same fictional sample data as /os/demo), framed inside
 * the clubs-page card portal. Only this route may be framed, and only by
 * emblem.cards itself (next.config.mjs: X-Frame-Options SAMEORIGIN and
 * CSP frame-ancestors 'self'); every other route stays DENY. Reads and
 * writes no real accounts.
 */
export const metadata: Metadata = {
  title: 'Emblem OS — Demo',
  description: 'A sample Emblem player profile with fictional data.',
  robots: { index: false, follow: false },
};

export default function OsDemoEmbedPage() {
  return (
    <Suspense fallback={null}>
      <OsApp demo embedded />
    </Suspense>
  );
}

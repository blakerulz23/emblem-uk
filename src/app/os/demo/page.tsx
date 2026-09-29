import type { Metadata } from 'next';
import { Suspense } from 'react';
import OsApp from '../OsApp';

/**
 * Public, no-sign-in demo of Emblem OS on made-up sample data (the same
 * DEMO_OS_DATA the app falls back to without Supabase). For showing the
 * app to players, clubs and partners. Reads and writes no real accounts:
 * no session is looked up and no initialData is passed, so every screen
 * renders the synthetic players, moments and team. The Owner / Coach pill
 * in the header switches between the parent and coach sides.
 */
export const metadata: Metadata = {
  title: 'Emblem OS — Demo',
  description: 'A look inside the app an Emblem card unlocks, with sample data.',
  robots: { index: false, follow: false },
};

export default function OsDemoPage() {
  // OsApp reads the URL (?screen=), which needs a Suspense boundary on a
  // statically rendered page.
  return (
    <Suspense fallback={null}>
      <OsApp demo />
    </Suspense>
  );
}

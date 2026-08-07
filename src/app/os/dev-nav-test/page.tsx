'use client';

/**
 * DEV-ONLY diagnostic page — not linked from anywhere in the product.
 * Renders the real OsApp component (not a reimplementation) with the app's
 * own actual DEMO_OS_DATA and synthetic-but-structurally-real auth props —
 * exactly the props src/app/os/page.tsx itself would pass after a real
 * Supabase session resolves. No real login/session is forged; this simply
 * supplies the same plain props OsApp already accepts.
 *
 * Deliberately nested under src/app/os/ (not src/app/dev/) so it inherits
 * os/layout.tsx's os.css import AND matches ConditionalChrome.tsx's
 * `pathname.startsWith('/os')` check — the real /os route renders with no
 * site marketing header/footer at all, and this needs the exact same
 * chrome-free environment to measure fixed-nav positioning correctly (an
 * earlier version of this harness lived under /dev/ and picked up the
 * site's Navbar, which pushed everything down and produced false
 * "content hidden behind the nav" readings that had nothing to do with the
 * actual nav implementation).
 *
 * Exists to visually verify the fixed bottom navigation (Player OS and, via
 * the existing demo-only role-toggle pill inside OsApp itself, Coach OS)
 * without needing a real authenticated account — this repo has no dev auth
 * bypass, and forging a real session isn't appropriate.
 */

import { Suspense } from 'react';
import OsApp from '../OsApp';
import { DEMO_OS_DATA } from '../osData';

export default function OsNavTestPage() {
  return (
    <Suspense fallback={null}>
      <OsApp
        initialData={DEMO_OS_DATA}
        hasSession
        profileRole="parent"
        hasClaimedPlayer
        hasTeam
      />
    </Suspense>
  );
}

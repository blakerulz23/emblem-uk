'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/**
 * The home page and the builder flow have their own self-contained chrome:
 *   /         — landing page with inline nav (Wordmark + Products + The tap + CTA)
 *   /builder  — mobile builder shell with sticky glass header
 *
 * The global Navbar + Footer render on every OTHER route (/about, /pricing, …).
 */
export default function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const isBuilder = pathname.startsWith('/builder');
  const isHome = pathname === '/';

  if (isBuilder) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (isHome) {
    // Home owns its sticky nav. Render via a wrapper that includes the global
    // top header (wordmark + links + CTA) so users on the homepage still see
    // the same nav as everywhere else.
    return (
      <>
        <Navbar />
        <main className="emh-home-shell">{children}</main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="pt-16">{children}</main>
      <Footer />
    </>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

/**
 * The home page, the builder flow, Emblem OS, and a player's public profile
 * have their own self-contained chrome:
 *   /              — landing page with inline nav (Wordmark + Products + The tap + CTA)
 *   /builder       — mobile builder shell with sticky glass header
 *   /os            — the phone-shell Emblem OS demo (its own full-bleed frame, no site nav)
 *   /player/[id]   — a claimed card's public profile, tapped from a physical
 *                    card or shared as a link — the marketing site's nav
 *                    (with its own "Build your card" CTA etc.) has no place
 *                    on a page whose whole job is showing one player's story.
 *
 * The global Navbar + Footer render on every OTHER route (/about, /pricing, …).
 */
// Routes that make up the public marketing experience — these get the
// emblem.cards typography (see .marketing-shell in globals.css). Everything
// else (Builder, Player OS, Staff tools, /lastshot, dead/internal routes)
// keeps its current typography untouched, even where it shares the same
// Navbar/Footer chrome.
const MARKETING_ROUTES = ['/', '/about', '/pricing', '/privacy', '/terms', '/card-setup-preview'];

export default function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const isBuilder = pathname.startsWith('/builder');
  const isOs = pathname.startsWith('/os');
  const isPlayerProfile = pathname.startsWith('/player/');
  const isHome = pathname === '/';
  const isMarketing = MARKETING_ROUTES.includes(pathname);

  if (isBuilder || isOs || isPlayerProfile) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (isHome) {
    // Home owns its sticky nav. Render via a wrapper that includes the global
    // top header (wordmark + links + CTA) so users on the homepage still see
    // the same nav as everywhere else.
    return (
      <div className={isMarketing ? 'marketing-shell' : undefined}>
        <Navbar />
        <main className="emh-home-shell">{children}</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={isMarketing ? 'marketing-shell' : undefined}>
      <Navbar />
      <main className="pt-16">{children}</main>
      <Footer />
    </div>
  );
}

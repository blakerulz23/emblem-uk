import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerMomentSection from '@/components/PlayerMomentSection';
import PlayerOsCollectionSection from '@/components/PlayerOsCollectionSection';
import TrustSafeguardingPanel from '@/components/TrustSafeguardingPanel';
import SquadInviteJourneySection from '@/components/SquadInviteJourneySection';
import JsonLd from '@/components/marketing/JsonLd';
import { HowItWorksSection } from '../HomeEffects';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { PAGE_DESCRIPTIONS, pageOpenGraph, PRICES } from '@/lib/marketing/site';
import { breadcrumbJsonLd } from '@/lib/marketing/structured-data';

// The long-form story that used to sit on the homepage (moved here unchanged
// when the homepage was shortened). Same components, same copy.
export const metadata: Metadata = {
  title: 'How Emblem Personalised Football Cards Work | Design, Print, Tap',
  description: PAGE_DESCRIPTIONS.howItWorks,
  alternates: { canonical: '/how-it-works' },
  openGraph: pageOpenGraph({ title: 'How Emblem works: design it, print it, tap it', url: '/how-it-works' }),
};

export default function HowItWorksPage() {
  const squadInviteEnabled = isSquadInviteMvpEnabled();
  return (
    <main className="emh-page">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }])} />

      <section className="emh-section emh-subpage-hero">
        <p className="emh-eyebrow">How it works</p>
        <h1>From one photo to a card that comes to life.</h1>
        <p>Make your own personalised football card in a few minutes. We print it in the UK on premium stock with a chip inside, and the card opens a private player profile their family controls.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="hiw_build">Build my card · {PRICES.single}</Link>
          <Link className="emh-btn emh-btn-secondary" href="/os/demo" data-track="hiw_try_app">Try the app</Link>
        </div>
      </section>

      <section id="journey" className="emh-forever-section">
        <HowItWorksSection />
      </section>

      <PlayerOsCollectionSection />

      <TrustSafeguardingPanel />

      <PlayerMomentSection />

      <SquadInviteJourneySection squadInviteEnabled={squadInviteEnabled} ctaHref="/squad-invite/start" />
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import CardGallery from '@/components/marketing/CardGallery';
import JsonLd from '@/components/marketing/JsonLd';
import { FaqAccordion } from '../HomeEffects';
import { GIFT_PAGE_FAQ_ITEMS } from '@/lib/marketing/faq';
import { CHRISTMAS_ORDER_BY, pageOpenGraph, PRICES } from '@/lib/marketing/site';
import { breadcrumbJsonLd, faqPageJsonLd, personalisedCardProductJsonLd } from '@/lib/marketing/structured-data';

// Christmas gift landing page. Targets (UK DataForSEO, Oct 2026):
// childrens/children's football gifts (2,400/mo, Nov 6,600), personalised
// football gifts (720, Nov 1,900), football christmas gifts (590),
// christmas football presents (590), football stocking fillers (260).
export const metadata: Metadata = {
  title: 'Personalised Football Gifts for Kids This Christmas | Emblem',
  description: `A personalised football card made from their photo, with a chip that opens their own player profile. A Christmas football gift for kids that keeps growing. ${PRICES.single}, printed in the UK.`,
  alternates: { canonical: '/football-gifts-for-kids' },
  openGraph: pageOpenGraph({ title: 'The football gift that keeps going', url: '/football-gifts-for-kids' }),
};

const reasons = [
  { title: 'It’s really theirs', body: 'Their photo, name, number and club on a premium printed football card. No two are the same.' },
  { title: 'It keeps going after Christmas', body: 'Tap the card to open their private player profile, where goals, appearances, photos and coach recognition build up all season.' },
  { title: 'Safe to give', body: 'Profiles are private by default. If you are not the parent, their parent or guardian approves the card before we print it.' },
  { title: 'Small enough for a stocking', body: 'A trading card that fits in a stocking or a gift box, and costs ' + PRICES.single + ' with the profile included.' },
];

export default function FootballGiftsForKidsPage() {
  return (
    <main className="emh-page">
      <JsonLd
        data={[
          personalisedCardProductJsonLd(),
          faqPageJsonLd(GIFT_PAGE_FAQ_ITEMS),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Football gifts for kids', path: '/football-gifts-for-kids' }]),
        ]}
      />

      <section className="emh-section emh-subpage-hero emh-gift-hero">
        <p className="emh-eyebrow">Christmas football gifts</p>
        <h1>Personalised football gifts for kids, this Christmas.</h1>
        <p>Give the young footballer in your life their own personalised football card, with a chip inside that opens a profile of their season. A gift they’ll unwrap and keep adding to all year.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="gift_hero_build">
            Build their card · {PRICES.single}
          </Link>
          <Link className="emh-btn emh-btn-secondary" href="/os/demo" data-track="gift_hero_try_app">See what the card unlocks</Link>
        </div>
        {/* Shown only once production confirms a real last order date (lib/marketing/site.ts). */}
        {CHRISTMAS_ORDER_BY && (
          <p className="emh-gift-deadline" role="note">
            Order by {CHRISTMAS_ORDER_BY} for Christmas delivery.
          </p>
        )}
      </section>

      <CardGallery eyebrow="Gift designs" heading="Pick a design they’ll love." trackPrefix="gift_gallery" />

      <section className="emh-section emh-gift-reasons" aria-labelledby="emh-gift-reasons-heading">
        <p className="emh-eyebrow">Why it makes a great gift</p>
        <h2 id="emh-gift-reasons-heading">More than a football card.</h2>
        <div className="emh-trust-grid">
          {reasons.map((r) => (
            <div key={r.title} className="emh-trust-item">
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="emh-section emh-steps" aria-labelledby="emh-gift-steps-heading">
        <p className="emh-eyebrow">Ordering a gift</p>
        <h2 id="emh-gift-steps-heading">Three steps to a gift they’ll keep.</h2>
        <ol className="emh-steps-grid">
          <li className="emh-step">
            <span className="emh-step-number" aria-hidden="true">1</span>
            <h3>Design it</h3>
            <p>Upload a photo of them in their kit, choose a design and add their name, number and club.</p>
          </li>
          <li className="emh-step">
            <span className="emh-step-number" aria-hidden="true">2</span>
            <h3>Approve it</h3>
            <p>Buying for someone else’s child? We ask their parent or guardian to approve the card before printing.</p>
          </li>
          <li className="emh-step">
            <span className="emh-step-number" aria-hidden="true">3</span>
            <h3>Unwrap and tap</h3>
            <p>We print it in the UK and post it to you. When they unwrap it, tap the card to a phone to open their profile.</p>
          </li>
        </ol>
      </section>

      <section className="emh-section emh-faq">
        <div className="emh-faq-inner">
          <div className="emh-faq-head">
            <p className="emh-eyebrow">Gift questions</p>
            <h2>Before you order.</h2>
          </div>
          <FaqAccordion items={GIFT_PAGE_FAQ_ITEMS} idPrefix="gift-faq" />
          <div className="emh-faq-cta">
            <h3>More questions?</h3>
            <Link href="/faq">Read all questions</Link>
          </div>
        </div>
      </section>

      <section className="emh-final-cta">
        <h2>Give them a card that grows with them.</h2>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="gift_final_build">
            Build their card <Icon name="chevR" size={16} />
          </Link>
          <Link className="emh-btn emh-btn-secondary" href="/builder?mode=set" data-track="gift_final_set">Cards for siblings</Link>
        </div>
      </section>
    </main>
  );
}

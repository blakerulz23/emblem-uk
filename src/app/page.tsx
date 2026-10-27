import type { Metadata } from 'next';
import Link from 'next/link';
import PlayerMomentSection from '@/components/PlayerMomentSection';
import Icon from '@/components/builder/emblem/Icon';
import HeroStage from '@/components/marketing/HeroStage';
import JsonLd from '@/components/marketing/JsonLd';
import { PAGE_DESCRIPTIONS, pageOpenGraph, PRICES } from '@/lib/marketing/site';
import { organizationJsonLd, personalisedCardProductJsonLd } from '@/lib/marketing/structured-data';

// Homepage layout follows the shorter Canadian page (buy action and price
// directly under the headline, card designs shown inside the hero, then
// pricing and links out); copy targets the UK DataForSEO research.
// The long story sections live on /how-it-works, the full FAQ (and its
// FAQPage structured data) on /faq, the design gallery on the gift page.
export const metadata: Metadata = {
  title: 'Personalised Football Cards with a Digital Profile | Emblem',
  description: PAGE_DESCRIPTIONS.home,
  alternates: { canonical: '/' },
  openGraph: pageOpenGraph({
    title: 'Personalised football cards that come to life with a tap | Emblem',
    description: 'Their photo on a premium printed card, with a chip that opens a private player profile. Printed in the UK.',
    url: '/',
  }),
};

const tiers = [
  {
    name: 'Single card',
    who: 'One personalised card for one player. The perfect gift.',
    price: PRICES.single,
    points: ['Premium printed football card', 'Built-in NFC chip', 'Private digital player profile', 'No subscription'],
    cta: 'Build one card',
    href: '/builder?mode=single',
    featured: true,
  },
  {
    name: 'Multi-card set',
    who: 'Two to nine cards in one order.',
    price: `From ${PRICES.multi}`,
    priceSuffix: 'per card',
    points: ['Everything in a single card', 'One order for several players', 'Ideal for siblings and friends'],
    cta: 'Build a set',
    href: '/builder?mode=set',
  },
  {
    name: 'Full squad',
    badge: 'Best for clubs',
    who: 'Ten or more cards in one order.',
    price: `From ${PRICES.squad}`,
    priceSuffix: 'per card',
    points: ['Club badge and colours on every card', 'Bulk photo upload and squad approval', 'Coach OS access', 'Free coach card included'],
    cta: 'Build your squad',
    href: '/builder?mode=squad',
  },
];

const steps = [
  { title: 'Design it.', caption: 'Their photo, name and number' },
  { title: 'Print it.', caption: 'Premium card with a chip inside' },
  { title: 'Tap it.', caption: 'Their profile opens. No app' },
];

const trustItems = [
  { title: 'Private by default', body: 'Player profiles are private by default and managed through guardian-controlled access.' },
  { title: 'Guardian controlled', body: 'Parents and guardians decide what is added, who can see it and when it is deleted.' },
  { title: 'Approved before printing', body: 'If you are not the parent, their parent or guardian approves the card first.' },
  { title: 'Secure checkout', body: 'Pay through Shopify’s secure checkout. UK delivery is shown before you pay.' },
];

export default function Home() {
  const explore = [
    { label: 'Try the app', body: 'Open the private profile a card unlocks, with sample data. No sign-in needed.', href: '/os/demo' },
    { label: 'How it works', body: 'From one photo to a printed card with a chip inside, and a profile that grows every season.', href: '/how-it-works' },
    {
      label: 'For coaches and teams',
      body: 'Your coach receives a free personalised card once 10 families in your squad have paid.',
      href: '/football-cards-for-clubs',
    },
    { label: 'Privacy and safety', body: 'Private by default and controlled by parents.', href: '/trust-and-safeguarding' },
  ];

  return (
    <main className="emh-page">
      <JsonLd data={[organizationJsonLd(), personalisedCardProductJsonLd()]} />

      <section id="top" className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        {/* Copy left and the card-and-phone showcase right on desktop; on
            phones the blocks stack as intro → showcase → actions (DOM order). */}
        <div className="emh-hero emh-home-hero">
          <div className="emh-home-hero-intro">
            <p className="emh-eyebrow">Personalised football cards</p>
            <h1>
              Their own football card.
              <br />
              Their season brought to life.
            </h1>
            <p className="emh-home-hero-desc">
              Put your young footballer on a premium personalised card. A phone tap opens their private profile, where their family can collect season memories and celebrate achievements.
            </p>
          </div>

          <div className="emh-home-hero-visual">
            <HeroStage />
          </div>

          <div className="emh-home-hero-actions">
            <Link className="emh-btn emh-btn-primary emh-home-hero-cta" href="/builder?mode=single" data-track="hero_build">
              Build My Card
              <span aria-hidden="true" className="emh-hero-cta-icon">
                <Icon name="chevR" size={18} />
              </span>
            </Link>
            <p className="emh-home-hero-price">{PRICES.single} · Private digital profile included</p>
            <p className="emh-home-hero-delivery">UK delivery calculated at checkout.</p>
            <Link className="emh-hero-demo emh-home-hero-demo" href="/os/demo" data-track="hero_try_app">
              Explore the app
              <Icon name="chevR" size={14} />
            </Link>
          </div>

          <div className="emh-hero-footer">
            <ol className="emh-hero-steps">
              {steps.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  <span>{step.caption}</span>
                </li>
              ))}
            </ol>
            <div className="emh-hero-proof">
              <div className="emh-hero-proof-item">
                <img className="emh-hero-proof-icon" src="/assets/hero-proof/premium-stock.svg" width={44} height={44} alt="" aria-hidden="true" />
                Premium trading card
              </div>
              <div className="emh-hero-proof-item">
                <img className="emh-hero-proof-icon" src="/assets/hero-proof/built-in-nfc.svg" width={44} height={44} alt="" aria-hidden="true" />
                Built-in NFC
              </div>
              <div className="emh-hero-proof-item">
                <img className="emh-hero-proof-icon" src="/assets/hero-proof/printed-in-uk.svg" width={44} height={44} alt="" aria-hidden="true" />
                Printed in the UK
              </div>
            </div>
          </div>
        </div>
      </section>

      <PlayerMomentSection ctaTrack="home_moment_build" />

      <section id="pricing" className="emh-section emh-pricing">
        <p className="emh-eyebrow">Pricing</p>
        <h2>Choose how you want to collect.</h2>
        <p>Start with one card, order a set for siblings or friends, or bring the whole squad together. Every card includes premium printing, built-in NFC and its digital profile.</p>
        <div className="emh-tier-grid">
          {tiers.map((tier) => (
            <article key={tier.name} className={tier.featured ? 'emh-tier-featured' : ''}>
              {tier.badge && <span className="emh-tier-flag">{tier.badge}</span>}
              <h3>{tier.name}</h3>
              <p>{tier.who}</p>
              <strong>
                {tier.price}
                {tier.priceSuffix && <span> {tier.priceSuffix}</span>}
              </strong>
              <ul>
                {tier.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={tier.href} data-track={`pricing_${tier.href.split('=')[1]}`}>
                {tier.cta}
                <Icon name="chevR" size={16} />
              </Link>
            </article>
          ))}
        </div>
        <div className="emh-pricing-note">
          <p className="emh-pricing-reassurance">Digital profile access included. No annual subscription.</p>
          <p className="emh-pricing-delivery">UK delivery is calculated at checkout and shown before you pay.</p>
        </div>
      </section>

      <section id="trust" className="emh-section emh-trust" aria-labelledby="emh-trust-heading">
        <p className="emh-eyebrow">Trust and safeguarding</p>
        <h2 id="emh-trust-heading">Built around young players’ privacy.</h2>
        <div className="emh-trust-grid">
          {trustItems.map((item) => (
            <div key={item.title} className="emh-trust-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
        <Link className="emh-text-link" href="/trust-and-safeguarding" data-track="trust_more">
          How we protect players <Icon name="chevR" size={14} />
        </Link>
      </section>

      <section id="gifts" className="emh-section emh-gift-promo" aria-labelledby="emh-gift-heading">
        <div>
          <p className="emh-eyebrow">Christmas</p>
          <h2 id="emh-gift-heading">The football gift that keeps going.</h2>
          <p>A personalised football card they can hold, with a profile that keeps growing long after Christmas.</p>
        </div>
        <Link className="emh-btn emh-btn-primary" href="/football-gifts-for-kids" data-track="gift_promo">
          Football gifts for kids
        </Link>
      </section>

      <section id="explore" className="emh-section emh-explore">
        <h2>Want the full picture?</h2>
        <div className="emh-explore-grid">
          {explore.map((item) => (
            <Link key={item.href} className="emh-explore-card" href={item.href} data-track={`explore_${item.href.replace(/\W+/g, '_')}`}>
              <span className="emh-explore-title">
                {item.label}
                <Icon name="chevR" size={16} />
              </span>
              <span className="emh-explore-body">{item.body}</span>
            </Link>
          ))}
        </div>
        <div className="emh-explore-cta">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="explore_build">
            Build my card · {PRICES.single}
          </Link>
          <Link className="emh-explore-faq" href="/faq" data-track="explore_faq">
            Questions? Read the FAQ
          </Link>
        </div>
      </section>

    </main>
  );
}

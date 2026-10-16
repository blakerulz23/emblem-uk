import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import CardGallery from '@/components/marketing/CardGallery';
import JsonLd from '@/components/marketing/JsonLd';
import { FaqAccordion } from './HomeEffects';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { HOMEPAGE_FAQ_ITEMS } from '@/lib/marketing/faq';
import { pageOpenGraph, PRICES } from '@/lib/marketing/site';
import { faqPageJsonLd, organizationJsonLd, personalisedCardProductJsonLd } from '@/lib/marketing/structured-data';

// Homepage layout follows the shorter Canadian page (buy action and price
// directly under the headline, a quiet "try the app" link, then pricing and
// links out); copy targets the UK DataForSEO research.
// The long story sections moved to /how-it-works, the full FAQ to /faq.
export const metadata: Metadata = {
  title: 'Personalised Football Cards with a Digital Profile | Emblem',
  description:
    'Personalised football cards made from your child’s photo, printed in the UK with a built-in NFC chip that opens a private, guardian-controlled player profile. From ' +
    PRICES.single +
    '.',
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
  { title: 'Design it', body: 'Upload their best photo, choose a design and add their name, number and club. We tidy the background for you.' },
  { title: 'Print it', body: 'We print it in the UK on premium 400gsm stock with a real NFC chip inside, and post it to you.' },
  { title: 'Tap it', body: 'Hold the card to a phone and their private player profile opens. No app to download.' },
];

const trustItems = [
  { title: 'Private by default', body: 'Player profiles are private by default and managed through guardian-controlled access.' },
  { title: 'Guardian controlled', body: 'Parents and guardians decide what is added, who can see it and when it is deleted.' },
  { title: 'Approved before printing', body: 'If you are not the parent, their parent or guardian approves the card first.' },
  { title: 'Secure checkout', body: 'Pay through Shopify’s secure checkout. UK delivery is shown before you pay.' },
];

export default function Home() {
  const squadInviteEnabled = isSquadInviteMvpEnabled();
  const explore = [
    { label: 'Try the app', body: 'Open the private profile a card unlocks, with sample data. No sign-in needed.', href: '/os/demo' },
    { label: 'How it works', body: 'From one photo to a printed card with a chip inside, and a profile that grows every season.', href: '/how-it-works' },
    {
      label: 'For coaches and teams',
      body: 'One invite for the whole squad, with a free coach card on full-squad orders.',
      href: squadInviteEnabled ? '/squad-invite/start' : '/builder?mode=squad',
    },
    { label: 'Privacy and safety', body: 'Private by default and controlled by parents.', href: '/trust-and-safeguarding' },
  ];

  return (
    <main className="emh-page">
      <JsonLd data={[organizationJsonLd(), personalisedCardProductJsonLd(), faqPageJsonLd(HOMEPAGE_FAQ_ITEMS)]} />

      <section id="top" className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        <div className="emh-hero">
          <div className="emh-hero-copy">
            <p className="emh-eyebrow">Personalised football cards</p>
            <h1>Personalised football cards that come to life with a tap.</h1>
            <div className="emh-actions emh-hero-actions-single">
              <Link className="emh-btn emh-btn-primary emh-hero-cta" href="/builder?mode=single" data-track="hero_build">
                BUILD MY CARD
                <span aria-hidden="true" className="emh-hero-cta-icon">
                  <Icon name="chevR" size={18} />
                </span>
              </Link>
            </div>
            <p className="emh-hero-price">{PRICES.single} · digital player profile included · UK delivery shown at checkout</p>
            <Link className="emh-hero-demo" href="/os/demo" data-track="hero_try_app">
              Or try the app first
              <Icon name="chevR" size={14} />
            </Link>
            <p className="emh-hero-lede emh-hero-lede-after">
              Send us their best football photo. We print it on a premium card with a chip inside, so tapping the card opens a private profile that grows with every match, goal and season.
            </p>
          </div>

          <picture>
            <source type="image/webp" srcSet="/assets/home/hero-composition-640.webp 640w, /assets/home/hero-composition-1008.webp 1008w" sizes="(max-width: 760px) 100vw, 560px" />
            <img
              className="emh-hero-product-image"
              src="/hero-product-composition.png"
              width={1008}
              height={865}
              alt="A blank Emblem card ready for a photo upload, the finished personalised football card, and the connected digital player profile open on a phone"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>

          <div className="emh-hero-footer">
            <p className="emh-hero-process">
              <span>Design it.</span>
              <i aria-hidden="true" className="emh-hero-process-dot" />
              <span>Print it.</span>
              <i aria-hidden="true" className="emh-hero-process-dot" />
              <span>Tap it.</span>
            </p>
            <div className="emh-hero-proof">
              <div className="emh-hero-proof-item">
                <img className="emh-hero-proof-icon" src="/assets/hero-proof/premium-stock.svg" width={44} height={44} alt="" aria-hidden="true" />
                400GSM premium stock
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

      <CardGallery />

      <section id="how" className="emh-section emh-steps" aria-labelledby="emh-steps-heading">
        <p className="emh-eyebrow">How it works</p>
        <h2 id="emh-steps-heading">Design it. Print it. Tap it.</h2>
        <ol className="emh-steps-grid">
          {steps.map((step, i) => (
            <li key={step.title} className="emh-step">
              <span className="emh-step-number" aria-hidden="true">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <Link className="emh-text-link" href="/how-it-works" data-track="steps_more">
          See the whole journey <Icon name="chevR" size={14} />
        </Link>
      </section>

      <section id="single" className="emh-section emh-spotlight" aria-labelledby="emh-spotlight-heading">
        <div className="emh-spotlight-media">
          <img src="/assets/home/gallery/custom-royal.webp" width={400} height={560} loading="lazy" decoding="async" alt="A Royal Edition personalised football card design" />
        </div>
        <div className="emh-spotlight-copy">
          <p className="emh-eyebrow">One card · {PRICES.single}</p>
          <h2 id="emh-spotlight-heading">One card. A whole season of memories.</h2>
          <p>Every personalised football card comes with its own digital player profile for goals, appearances, photos and coach recognition, carried forward season after season.</p>
          <ul className="emh-spotlight-list">
            <li>Their photo, name, number and club on a premium printed card</li>
            <li>A built-in NFC chip: tap to open their profile</li>
            <li>A private profile their family controls</li>
            <li>No app download and no subscription</li>
          </ul>
          <div className="emh-spotlight-actions">
            <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="spotlight_build">Build one card · {PRICES.single}</Link>
            <Link className="emh-btn emh-btn-secondary" href="/os/demo" data-track="spotlight_try_app">See the app</Link>
          </div>
        </div>
      </section>

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
      </section>

      <section id="faq" className="emh-section emh-faq">
        <div className="emh-faq-inner">
          <div className="emh-faq-head">
            <p className="emh-eyebrow">FAQ</p>
            <h2>Questions, answered.</h2>
            <p>The questions parents ask first.</p>
          </div>
          <FaqAccordion items={HOMEPAGE_FAQ_ITEMS} idPrefix="home-faq" />
          <div className="emh-faq-cta">
            <h3>More questions?</h3>
            <Link href="/faq" data-track="faq_all">Read all questions</Link>
          </div>
        </div>
      </section>

      <section className="emh-final-cta">
        <img src="/embm.png" alt="Emblem" loading="lazy" decoding="async" />
        <h2>Start their story today.</h2>
        <p>Every football journey begins somewhere. Give them one worth keeping.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single" data-track="final_build">Build my card</Link>
          <Link className="emh-btn emh-btn-secondary" href="/os/demo" data-track="final_try_app">Try the app</Link>
        </div>
        <p className="emh-final-note">Printed in the UK · Digital profile included · No annual subscription</p>
      </section>
    </main>
  );
}

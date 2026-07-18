import Link from 'next/link';
import {
  BuiltForEveryoneSection,
  DigitalProfileSection,
  FaqAccordion,
  HeroCardShowcase,
  HowItWorksSection,
} from './HomeEffects';

const trust = [
  ['400gsm premium stock', 'Built to last'],
  ['Real NFC chip built in', 'Tap to unlock'],
  ['Ships in 5-7 days', 'Fast. Tracked. Reliable.'],
];

const squadPoints = [
  'Bulk-upload photos and assign them to players',
  'Apply one design to all cards and edit any individually',
  'Track who still needs a photo or details',
  'Set prints per player and approve all ready cards',
];

const rosterPreview = [
  { shirt: '10', name: 'Jacob Thompson', meta: 'Midfielder · 2 prints', swatch: '#F1601D', status: 'Approved', statusClass: 'ready' },
  { shirt: '7', name: 'Leo Barnes', meta: 'Winger · 2 prints', swatch: '#2F6BD6', status: 'Ready', statusClass: 'ready' },
  { shirt: '1', name: 'Alfie Whitworth', meta: 'Goalkeeper · 3 prints', swatch: '#3A3F45', status: 'Ready', statusClass: 'ready' },
  { shirt: '4', name: 'Musa Adeyemi', meta: 'Defender', swatch: '#1E8A55', status: 'Needs photo', statusClass: 'muted' },
];

const tiers = [
  {
    name: 'Single Player',
    who: 'One child, one card',
    price: '£24.99',
    per: 'includes first season free',
    points: ['Premium printed card', 'Interactive digital profile', 'Built for one player'],
    cta: 'Order a Card',
    href: '/builder?mode=single',
  },
  {
    name: 'Sibling Set',
    who: '2-4 cards, one basket',
    price: '£21.99 /ea',
    per: 'save 12% · first season free',
    points: ['Everything in Single', 'One basket for the family', 'Great for siblings and friends'],
    cta: 'Order a Set',
    href: '/builder?mode=squad',
    featured: true,
  },
  {
    name: 'Full Squad',
    who: 'Coaches & club admins',
    price: '£18.99 /ea',
    per: 'team pricing · bulk tools',
    points: ['Club badge & colours on every card', 'Bulk upload and squad approval', 'Approve the whole team together'],
    cta: 'Kit Out the Team',
    href: '/builder?mode=squad',
    green: true,
  },
];

export default function Home() {
  return (
    <main className="emh-page">
      <section id="top" className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        <div className="emh-hero">
          <div className="emh-hero-copy">
            <h1>
              Premium custom <span>football</span>{' '}
              <br />
              <span>trading cards</span>
            </h1>
          </div>

          <p className="emh-hero-subline">More than a football card.</p>
          <HeroCardShowcase />

          <div className="emh-hero-footer">
            <div className="emh-actions">
              <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Create My Card</Link>
              <Link className="emh-btn emh-btn-secondary" href="/builder?mode=squad">Build a team pack</Link>
            </div>

            <div className="emh-trust-strip">
              {trust.map(([label, detail]) => (
                <span key={label}>
                  <i />
                  <span className="emh-trust-copy">
                    <b>{label}</b>
                    <small>{detail}</small>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="journey" className="emh-forever-section">
        <HowItWorksSection />
      </section>

      <section id="card" className="emh-profile-section">
        <DigitalProfileSection />
      </section>

      <section id="everyone" className="emh-everyone-section">
        <BuiltForEveryoneSection />
      </section>

      <section id="squad" className="emh-section emh-squad">
        <div className="emh-squad-copy">
          <p className="emh-eyebrow">For clubs & teams</p>
          <h2>One session. The whole squad.</h2>
          <p>
            The builder works like a squad sheet, not a repeated checkout. Add siblings, friends or all sixteen players, bulk-upload photos, apply one design across every card, then approve them together.
          </p>
          <ul>
            {squadPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=squad">Build a team pack</Link>
        </div>
        <div className="emh-roster-card">
          <div className="emh-roster-head">
            <div>
              <p>Order session</p>
              <h3>AFC Oldham U12s, end of season</h3>
            </div>
            <span>14 / 16 ready</span>
          </div>
          <div className="emh-roster-list">
            {rosterPreview.map((row) => (
              <div key={row.name} className="emh-roster-row">
                <span className="emh-shirt" style={{ background: row.swatch }}>{row.shirt}</span>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.meta}</small>
                </div>
                <em className={`emh-status emh-status-${row.statusClass}`}>{row.status}</em>
              </div>
            ))}
            <div className="emh-roster-actions">
              <span>Apply to all</span>
              <span>Approve 14 ready</span>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="emh-section emh-pricing">
        <p className="emh-eyebrow">Pricing</p>
        <h2>One card. A lifetime of story.</h2>
        <p>Placeholder pricing shown. Final tiers confirmed at checkout, with UK delivery from £3.95.</p>
        <div className="emh-tier-grid">
          {tiers.map((tier) => (
            <article key={tier.name} className={`${tier.featured ? 'emh-tier-featured' : ''} ${tier.green ? 'emh-tier-green' : ''}`}>
              {tier.featured && <span className="emh-tier-flag">Most popular</span>}
              <h3>{tier.name}</h3>
              <p>{tier.who}</p>
              <strong>{tier.price} <span>{tier.per}</span></strong>
              <ul>
                {tier.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <Link href={tier.href}>{tier.cta}</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="emh-section emh-faq">
        <div className="emh-faq-inner">
          <div className="emh-faq-head">
            <p className="emh-eyebrow">Still deciding?</p>
            <h2>Frequently Asked Questions</h2>
            <p>Everything you need to know before you create their card.</p>
          </div>
          <FaqAccordion />
          <div className="emh-faq-cta">
            <h3>Still have questions?</h3>
            <Link href="/builder?mode=single">Start your card</Link>
          </div>
        </div>
      </section>

      <section className="emh-final-cta">
        <img src="/embm.png" alt="Emblem" loading="lazy" decoding="async" />
        <h2>Start their story today.</h2>
        <p>Every football journey begins somewhere. Give them one worth keeping.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Order a Card</Link>
          <Link className="emh-btn emh-btn-secondary" href="/builder?mode=squad">Build a team pack</Link>
        </div>
        <p className="emh-final-note">Ships in 5-7 days · First season free · Made in the UK</p>
      </section>
    </main>
  );
}

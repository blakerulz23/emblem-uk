import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import DigitalProfileSection from '@/components/DigitalProfileSection';
import {
  FaqAccordion,
  HowItWorksSection,
  TapVideo,
} from './HomeEffects';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

const squadGroups = [
  {
    number: '1',
    heading: 'Build the squad',
    items: [
      'Bulk-upload player photos',
      'Apply one design across the team',
      'Review and approve every card',
    ],
  },
  {
    number: '2',
    heading: 'Keep their stories growing',
    items: [
      'Verify moments submitted by parents',
      'Award player achievements',
      'Manage every profile from one dashboard',
    ],
  },
];

const rosterPreview = [
  { shirt: '10', name: 'Jacob Thompson', meta: 'Midfielder · 2 prints', swatch: '#F1601D', status: 'Approved', statusClass: 'ready', photo: '/seed-jacob.png' },
  { shirt: '7', name: 'Leo Barnes', meta: 'Winger · 2 prints', swatch: '#2F6BD6', status: 'Ready', statusClass: 'ready', photo: '/seed-leo.png' },
];

const coachOsAvatars = [
  { name: 'Jacob Thompson', photo: '/seed-jacob.png' },
  { name: 'Leo Barnes', photo: '/seed-leo.png' },
  { name: 'Squad player', photo: '/assets/marketing/coachos-avatar-1.png' },
  { name: 'Squad player', photo: '/assets/marketing/coachos-avatar-2.png' },
  { name: 'Squad player', photo: '/assets/marketing/coachos-avatar-3.png' },
];

const tiers = [
  {
    name: 'Single player',
    who: 'One personalised card for one player.',
    price: '£24.99',
    points: ['Premium printed trading card', 'Built-in NFC', 'Digital player profile included'],
    cta: 'Build one card',
    href: '/builder?mode=single',
  },
  {
    name: 'Multi-card set',
    who: 'Two to nine player cards in one order.',
    price: 'From £21.99',
    priceSuffix: 'per card',
    points: ['Everything included with a single card', 'One simple order for multiple players', 'Ideal for siblings, friends or small groups'],
    cta: 'Build a set',
    href: '/builder?mode=set',
  },
  {
    name: 'Full squad',
    badge: 'Best for clubs',
    who: 'Ten or more player cards in one order.',
    price: 'From £18.99',
    priceSuffix: 'per card',
    points: ['Club badge and colours across every card', 'Bulk photo upload and squad approval', 'Coach OS access', 'Free coach card included'],
    cta: 'Build your squad',
    href: '/builder?mode=squad',
    featured: true,
  },
];

export default function Home() {
  const squadInviteEnabled = isSquadInviteMvpEnabled();
  return (
    <main className="emh-page">
      <section id="top" className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        <div className="emh-hero">
          <div className="emh-hero-copy">
            <p className="emh-eyebrow">Premium custom trading cards</p>
            <h1>Turning sporting moments into lasting collectibles.</h1>
            <p className="emh-hero-lede">
              Create your card, then bring it to life with a tap&mdash;unlocking a digital profile that grows with every milestone, memory and achievement.
            </p>
            <div className="emh-actions emh-hero-actions-single">
              <Link className="emh-btn emh-btn-primary emh-hero-cta" href="/builder">
                BUILD YOUR CARD
                <span aria-hidden="true" className="emh-hero-cta-icon">
                  <Icon name="chevR" size={18} />
                </span>
              </Link>
            </div>
          </div>

          <img
            className="emh-hero-product-image"
            src="/hero-product-composition.png"
            alt="A blank Emblem card ready for a photo upload, the finished printed card, and the connected digital player profile open on a phone"
            loading="eager"
            decoding="async"
          />

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

      <DigitalProfileSection />

      <section id="journey" className="emh-forever-section">
        <HowItWorksSection />
      </section>

      <section id="tap" style={{ maxWidth: 'none', padding: 0 }}>
        <div style={{ maxWidth: 1140, margin: 'clamp(20px, 4vw, 40px) auto', padding: 'clamp(40px, 6vw, 72px) clamp(28px, 5vw, 72px)', background: 'var(--ink)', borderRadius: 'clamp(24px, 4vw, 40px)', display: 'grid', gridTemplateColumns: '1.1fr 1fr', alignItems: 'center', gap: 48, position: 'relative', overflow: 'hidden' }} className="tap-grid">
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, var(--accent), transparent 45%)', opacity: 0.35, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--accent)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
              SPORT AT EVERY LEVEL
            </span>
            <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.025em', margin: 0, color: '#fff', textWrap: 'balance' as const }}>
              Every player deserves their moment.
            </h2>
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 'clamp(16px, 1.5vw, 18.5px)', lineHeight: 1.5, color: 'rgba(255,255,255,.72)', margin: 0, maxWidth: '46ch', textWrap: 'pretty' as const }}>
              The moments that matter aren&rsquo;t reserved for packed stadiums. Emblem turns personal milestones, proud achievements and unforgettable performances into collectibles that celebrate how far they&rsquo;ve come.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href="/builder?mode=single" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, borderRadius: 14, height: 52, padding: '0 22px', fontSize: 16, background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px var(--accent-glow)' }}>
                MAKE YOURS <Icon name="chevR" size={18} />
              </Link>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 300 }}>
            <TapVideo poster="/videos/emblem-tap-poster.jpg" />
          </div>
        </div>
      </section>

      <section id="squad" className="emh-section emh-squad">
        <div className="emh-squad-copy">
          <p className="emh-eyebrow">For coaches & teams</p>
          <h2>One order. A whole season connected.</h2>
          <p>
            Create every player&rsquo;s card in one team session, then use Coach OS to recognise achievements, verify submitted moments and keep the squad&rsquo;s profiles growing throughout the season.
          </p>
        </div>

        <div className="emh-squad-groups">
          {squadGroups.map((group) => (
            <div key={group.number} className="emh-squad-group">
              <div className="emh-squad-group-top">
                <span className="emh-squad-group-number">{group.number}</span>
                <h3>{group.heading}</h3>
              </div>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <span className="emh-squad-check" aria-hidden="true"><Icon name="check" size={11} /></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="emh-squad-cta-row">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=squad">
            BUILD YOUR SQUAD
            <Icon name="chevR" size={18} />
          </Link>
          <p className="emh-squad-offer">
            <Icon name="slab" size={14} />
            Full-squad orders include a free coach card
          </p>
          {squadInviteEnabled && (
            <Link className="emh-btn emh-btn-secondary" href="/squad-invite/start">
              CREATE A SQUAD INVITE
              <Icon name="chevR" size={18} />
            </Link>
          )}
        </div>

        <div className="emh-squad-panels">
          <div className="emh-roster-card">
            <div className="emh-roster-head">
              <div>
                <p>Order session</p>
                <h3>AFC Oldham U12s</h3>
              </div>
            </div>
            <div className="emh-order-progress-row">
              <span className="emh-order-progress-label">14 / 16 ready</span>
              <span className="emh-progress-bar"><span style={{ width: '87.5%' }} /></span>
            </div>
            <div className="emh-roster-list">
              {rosterPreview.map((row) => (
                <div key={row.name} className="emh-order-row">
                  <span className="emh-order-row-photo">
                    <img src={row.photo} alt="" />
                    <em className="emh-order-row-number" style={{ background: row.swatch }}>{row.shirt}</em>
                  </span>
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.meta}</small>
                  </div>
                  <em className={`emh-status emh-status-${row.statusClass}`}>{row.status}</em>
                </div>
              ))}
            </div>
            <p className="emh-panel-footer">Review and approve every card before printing.</p>
          </div>

          <div className="emh-squad-connector" aria-hidden="true">
            <Icon name="chevR" size={28} stroke={3} />
          </div>

          <div className="emh-coachos-card">
            <div className="emh-coachos-head">
              <p>Coach OS</p>
              <h3>Squad overview</h3>
              <span className="emh-coachos-sub">Season in progress</span>
            </div>

            <div className="emh-coachos-avatars">
              {coachOsAvatars.map((player) => (
                <span key={player.name + player.photo} className="emh-coachos-avatar">
                  <img src={player.photo} alt="" />
                </span>
              ))}
              <span className="emh-coachos-avatar emh-coachos-avatar-more">+9</span>
            </div>

            <div className="emh-coachos-block">
              <p className="emh-coachos-label">Moment awaiting verification</p>
              <div className="emh-coachos-moment">
                <img className="emh-coachos-moment-thumb" src="/assets/marketing/coachos-moment-goal.png" alt="" />
                <div>
                  <strong>Goal vs. Rochdale</strong>
                  <small>Submitted by parent</small>
                  <small>Today</small>
                </div>
              </div>
              <span className="emh-coachos-approve">
                Approve
                <Icon name="chevR" size={13} />
              </span>
            </div>

            <div className="emh-coachos-block">
              <p className="emh-coachos-label">Achievement awarded</p>
              <div className="emh-coachos-achievement">
                <span className="emh-coachos-shield" aria-hidden="true"><Icon name="shield" size={20} /></span>
                <div>
                  <strong>Top Assist</strong>
                  <small>Awarded to Jacob Thompson</small>
                  <small>Today</small>
                </div>
              </div>
            </div>

            <p className="emh-panel-footer emh-panel-footer-dark">Recognise achievements and keep every profile growing.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="emh-section emh-pricing">
        <p className="emh-eyebrow">Pricing</p>
        <h2>Choose how you want to collect.</h2>
        <p>
          Start with one player, create a set or bring the whole squad together. Every card includes premium printing, built-in NFC and digital profile access with no annual subscription.
        </p>
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
                {tier.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <Link href={tier.href}>
                {tier.cta}
                <Icon name="chevR" size={16} />
              </Link>
            </article>
          ))}
        </div>
        <div className="emh-pricing-note">
          <p className="emh-pricing-reassurance">Digital profile access included. No annual subscription required.</p>
          <p className="emh-pricing-delivery">UK delivery calculated at checkout.</p>
        </div>
      </section>

      <section id="faq" className="emh-section emh-faq">
        <div className="emh-faq-inner">
          <div className="emh-faq-head">
            <p className="emh-eyebrow">FAQ</p>
            <h2>Questions, answered.</h2>
            <p>Everything you need to know before you create their card.</p>
          </div>
          <FaqAccordion />
          <div className="emh-faq-cta">
            <h3>Still have questions?</h3>
            <Link href="/builder?mode=single">Start Your Card</Link>
          </div>
        </div>
      </section>

      <section className="emh-final-cta">
        <img src="/embm.png" alt="Emblem" loading="lazy" decoding="async" />
        <h2>Start their story today.</h2>
        <p>Every football journey begins somewhere. Give them one worth keeping.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Order a Card</Link>
          <Link className="emh-btn emh-btn-secondary" href="/builder?mode=squad">Build a Team Pack</Link>
        </div>
        <p className="emh-final-note">Ships in 3-5 days · First season free · Made in the UK</p>
      </section>
    </main>
  );
}

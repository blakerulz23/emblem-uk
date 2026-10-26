import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import ClubsCardPortal from '@/components/marketing/clubs-portal/ClubsCardPortal';
import JsonLd from '@/components/marketing/JsonLd';
import { FaqAccordion } from '../HomeEffects';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { CLUB_PAGE_FAQ_ITEMS } from '@/lib/marketing/faq';
import { CLUB_ENQUIRY_EMAIL, PAGE_DESCRIPTIONS, pageOpenGraph, PRICES } from '@/lib/marketing/site';
import { breadcrumbJsonLd } from '@/lib/marketing/structured-data';

// Grassroots club landing page. Entry point to the existing Squad Invite
// flow (/squad-invite/start, private and not indexed). Every claim here
// follows the live Squad Invite rules: tier fixed at the deadline from
// completed family commitments, each family pays for its own card, free
// coach card after 10 paid families, organiser never handles a roster.
// Delivery cost is deliberately not promised until the policy is confirmed.
export const metadata: Metadata = {
  title: 'Football Cards for Grassroots Clubs and Teams | Emblem',
  description: PAGE_DESCRIPTIONS.clubs,
  alternates: { canonical: '/football-cards-for-clubs' },
  openGraph: pageOpenGraph({ title: 'Every player recognised. Every season remembered.', url: '/football-cards-for-clubs' }),
};

const playerGets = [
  { title: 'A card they’ll keep', body: 'Their photo, name, number and club on a premium personalised football trading card, printed in the UK.' },
  { title: 'A profile that grows', body: 'Tap the card to a phone and their private player profile opens, with appearances, goals and season moments.' },
  { title: 'Recognition from their coach', body: 'Coaches can verify the moments families share and award recognition, so effort is celebrated as well as goals.' },
  { title: 'No app to download', body: 'The profile opens straight from the card. Families manage it from their phone.' },
];

const safeguards = [
  { title: 'No roster to collect', body: 'You never upload children’s names or photos. You see the team’s progress and each joined player’s first name and surname initial, as printed on the card.' },
  { title: 'Parents stay in control', body: 'Each parent or guardian creates and approves their own child’s card, and can ask us to delete it.' },
  { title: 'Private by default', body: 'Player profiles are private, and public profiles stay switched off during the pilot.' },
  { title: 'Reviewed by people', body: 'Our team reviews every Squad Invite. Email verification confirms the organiser’s email address only; it is not a DBS check.' },
];

const tiers = [
  { name: '1 family', price: PRICES.single, suffix: 'per card', points: ['Premium printed card', 'Built-in NFC chip', 'Private player profile'] },
  { name: '2 to 9 families', price: PRICES.multi, suffix: 'per card', points: ['Everything in a single card', 'One link for the whole team'] },
  { name: '10 or more families', price: PRICES.squad, suffix: 'per card', points: ['The lowest price per card', 'Free coach card once 10 families have paid'], featured: true, badge: 'Best for squads' },
];

export default function FootballCardsForClubsPage() {
  const startHref = isSquadInviteMvpEnabled() ? '/squad-invite/start' : `mailto:${CLUB_ENQUIRY_EMAIL}?subject=${encodeURIComponent('Emblem club pilot')}`;
  const emailHref = `mailto:${CLUB_ENQUIRY_EMAIL}?subject=${encodeURIComponent('Emblem club pilot')}`;

  return (
    <main className="emh-page">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Football cards for clubs', path: '/football-cards-for-clubs' }])]} />

      {/* Copy on the left, the card and its portal on the right. On phones the
          blocks stack as intro → card → price and CTA (grid areas in CSS). */}
      <section className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        <div className="emh-clubs-hero">
          <div className="emh-clubs-hero-intro">
            <p className="emh-eyebrow">For grassroots football clubs</p>
            <h1>
              Your squad.
              <br />
              Their own football cards.
            </h1>
            <p className="emh-clubs-hero-desc">
              Give every player a personalised card to keep—and a private digital profile to celebrate their season.
            </p>
          </div>
          <div className="emh-clubs-hero-card">
            <ClubsCardPortal startHref={startHref} />
          </div>
          <div className="emh-clubs-hero-action">
            <p className="emh-clubs-hero-price">From {PRICES.squad} per card when 10 or more families commit by your squad deadline.</p>
            <Link className="emh-btn emh-btn-primary emh-clubs-hero-cta" href={startHref} data-track="clubs_hero_start">
              Start a Squad Invite
              <span aria-hidden="true" className="emh-hero-cta-icon">
                <Icon name="chevR" size={18} />
              </span>
            </Link>
            <p className="emh-clubs-hero-support">One link for your squad. Families create, approve and pay for their own cards.</p>
          </div>
        </div>
      </section>

      <section className="emh-section emh-clubs-gets" aria-labelledby="emh-clubs-gets-heading">
        <p className="emh-eyebrow">What every player gets</p>
        <h2 id="emh-clubs-gets-heading">A card to hold. A season to look back on.</h2>
        <div className="emh-trust-grid">
          {playerGets.map((item) => (
            <div key={item.title} className="emh-trust-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="emh-section emh-pricing" aria-labelledby="emh-clubs-pricing-heading">
        <p className="emh-eyebrow">Squad pricing</p>
        <h2 id="emh-clubs-pricing-heading">The more families join, the less each card costs.</h2>
        <p>Your team’s price is set at your deadline by the number of families who have committed to a card. Each family then pays for their own card through secure checkout.</p>
        <div className="emh-tier-grid">
          {tiers.map((tier) => (
            <article key={tier.name} className={tier.featured ? 'emh-tier-featured' : ''}>
              {tier.badge && <span className="emh-tier-flag">{tier.badge}</span>}
              <h3>{tier.name}</h3>
              <strong>
                {tier.price}
                <span> {tier.suffix}</span>
              </strong>
              <ul>
                {tier.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="emh-pricing-note">
          <p className="emh-pricing-reassurance">Digital profile included. No annual subscription.</p>
          <p className="emh-pricing-delivery">Cards are delivered together to your club’s chosen contact. Delivery details are confirmed with you during setup.</p>
        </div>
      </section>

      <section className="emh-section emh-trust" aria-labelledby="emh-clubs-trust-heading">
        <p className="emh-eyebrow">Guardian controls</p>
        <h2 id="emh-clubs-trust-heading">Built around young players’ privacy.</h2>
        <div className="emh-trust-grid">
          {safeguards.map((item) => (
            <div key={item.title} className="emh-trust-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
        <Link className="emh-text-link" href="/trust-and-safeguarding" data-track="clubs_safeguarding">
          How we protect players <Icon name="chevR" size={14} />
        </Link>
      </section>

      <section className="emh-section emh-gift-promo emh-clubs-coach" aria-labelledby="emh-clubs-coach-heading">
        <div>
          <p className="emh-eyebrow">For coaches</p>
          <h2 id="emh-clubs-coach-heading">Recognise your players all season.</h2>
          <p>See your squad, verify the moments families share and award recognition from one place. Try the demo and switch to the coach view at the top.</p>
        </div>
        <Link className="emh-btn emh-btn-primary" href="/os/demo" data-track="clubs_coach_demo">
          See the coach view
        </Link>
      </section>

      <section className="emh-section emh-faq">
        <div className="emh-faq-inner">
          <div className="emh-faq-head">
            <h2>Club questions.</h2>
          </div>
          <FaqAccordion items={CLUB_PAGE_FAQ_ITEMS} idPrefix="clubs-faq" />
        </div>
      </section>

      <section className="emh-section emh-explore emh-clubs-close">
        <h2>Bring your squad together this season.</h2>
        <div className="emh-explore-cta">
          <Link className="emh-btn emh-btn-primary" href={startHref} data-track="clubs_final_start">
            Start a Squad Invite
          </Link>
          <a className="emh-explore-faq" href={emailHref} data-track="clubs_email">
            Questions about the pilot? Email {CLUB_ENQUIRY_EMAIL}
          </a>
        </div>
      </section>
    </main>
  );
}

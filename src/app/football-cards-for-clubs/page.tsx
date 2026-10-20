import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import HeroStage from '@/components/marketing/HeroStage';
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

const steps = [
  { title: 'Apply', body: 'Verify your email and tell us your team name, age group, rough squad size, a deadline and who should receive the cards. No roster needed.' },
  { title: 'We review it', body: 'Our team reviews every request, usually within two business days.' },
  { title: 'Share one link', body: 'Once approved, add the delivery details and share your team’s private link with families.' },
  { title: 'Families build their own', body: 'Each family creates and approves their own child’s card, at their own pace.' },
  { title: 'Price confirmed, families pay', body: 'At your deadline the team’s price is set by the number of families who have committed. Each family then pays for their own card.' },
  { title: 'Delivered together', body: 'Paid cards are printed in the UK and delivered together to your club’s chosen contact.' },
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

      <section className="emh-hero-section">
        <div className="emh-glow" aria-hidden="true" />
        <div className="emh-hero">
          <div className="emh-hero-copy">
            <p className="emh-eyebrow">For grassroots clubs · controlled pilot</p>
            <h1>Every player recognised. Every season remembered.</h1>
            <div className="emh-actions emh-hero-actions-single">
              <Link className="emh-btn emh-btn-primary emh-hero-cta" href={startHref} data-track="clubs_hero_start">
                Start a Squad Invite
                <span aria-hidden="true" className="emh-hero-cta-icon">
                  <Icon name="chevR" size={18} />
                </span>
              </Link>
            </div>
            <p className="emh-hero-price">Squad pricing from {PRICES.squad} per card · families pay for their own · no roster to collect</p>
            <Link className="emh-hero-demo" href="/os/demo" data-track="clubs_hero_coach_demo">
              See the coach view
              <Icon name="chevR" size={14} />
            </Link>
            <p className="emh-hero-lede emh-hero-lede-after">
              Give your squad their own personalised football cards. Each card has a chip that opens the player’s private profile, where coaches can recognise goals, effort and milestones all season. One link for families, and every card delivered together to your club.
            </p>
          </div>
          <HeroStage />
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

      <section className="emh-section emh-steps emh-clubs-steps" aria-labelledby="emh-clubs-steps-heading">
        <p className="emh-eyebrow">How the club pilot works</p>
        <h2 id="emh-clubs-steps-heading">One link. Your whole squad.</h2>
        <ol className="emh-steps-grid">
          {steps.map((step, i) => (
            <li key={step.title} className="emh-step">
              <span className="emh-step-number" aria-hidden="true">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
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

      <section className="emh-section emh-clubs-pilot" aria-labelledby="emh-clubs-pilot-heading">
        <p className="emh-eyebrow">The pilot</p>
        <h2 id="emh-clubs-pilot-heading">Open to UK grassroots clubs.</h2>
        <div className="emh-trust-grid">
          <div className="emh-trust-item">
            <h3>Who can apply</h3>
            <p>UK grassroots clubs and teams with players aged U6 to U18.</p>
          </div>
          <div className="emh-trust-item">
            <h3>Who organises</h3>
            <p>A coach or authorised club representative, or a parent representative authorised by the team.</p>
          </div>
          <div className="emh-trust-item">
            <h3>What you’ll need</h3>
            <p>Your team name and age group, a rough squad size, a deadline for families, and a UK contact to receive the cards.</p>
          </div>
          <div className="emh-trust-item">
            <h3>What it costs the club</h3>
            <p>Nothing up front. Families pay for their own cards once the team’s price is confirmed.</p>
          </div>
        </div>
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

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

// One section for why families and clubs choose Emblem. Detailed privacy and
// organiser rules live in the club FAQ and on /trust-and-safeguarding.
const benefits = [
  { title: 'Their card. Their club.', body: 'Their photo, name, number and club on a personalised football card they can proudly keep.' },
  { title: 'More than a printed card', body: 'A phone tap opens their private player profile, bringing their season’s moments and achievements together.' },
  { title: 'Celebrate effort as well as goals', body: 'Coach recognition gives teamwork, commitment and progress a place alongside match-day achievements.' },
  { title: 'Parents stay in control', body: 'Parents create and approve their child’s card. Player profiles are private during the pilot.' },
];

// Quantity tiers of the same card, priced from PRICES. The fanned artwork
// is the fictional sample player used across the marketing site.
const HERO_CARD = (design: string, size: 400 | 560 = 400) => `/assets/home/hero/card-${design}-${size}.webp`;
const priceTiles = [
  { name: 'Single card', price: PRICES.single, cards: ['glacier'] },
  { name: '2–9 families', price: PRICES.multi, cards: ['crimson', 'royal', 'emerald'] },
  { name: '10+ families', price: PRICES.squad, cards: ['glacier', 'crimson', 'royal', 'emerald', 'royal'], note: 'Free coach card once 10 families have paid.' },
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
            <ClubsCardPortal />
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

      <section className="emh-section emh-trust emh-clubs-why" aria-labelledby="emh-clubs-why-heading">
        <h2 id="emh-clubs-why-heading">Why choose Emblem cards?</h2>
        <div className="emh-trust-grid">
          {benefits.map((item) => (
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

      <section id="pricing" className="emh-section emh-clubs-shop" aria-labelledby="emh-clubs-pricing-heading">
        <div className="emh-clubs-shop-intro">
          <h2 id="emh-clubs-pricing-heading">Their season. Worth keeping.</h2>
          <p>Personalised football cards for your squad, with a private digital profile included.</p>
          <Link className="emh-btn emh-btn-primary" href={startHref} data-track="clubs_pricing_start">
            Start a Squad Invite
            <span aria-hidden="true" className="emh-hero-cta-icon">
              <Icon name="chevR" size={18} />
            </span>
          </Link>
        </div>
        {/* Generated image of the sample player (likeness use confirmed) holding
            a blank card at real size; the exact Royal Edition artwork was
            composited onto the card afterwards, not regenerated. */}
        <div className="emh-clubs-shop-media">
          <img
            src="/assets/clubs/riley-holding-card-1100.webp"
            srcSet="/assets/clubs/riley-holding-card-640.webp 640w, /assets/clubs/riley-holding-card-1100.webp 1100w"
            sizes="(min-width: 960px) 520px, 100vw"
            alt="Riley Hart, a sample player, smiling and holding his personalised Royal Edition Emblem card"
            width={1100}
            height={1043}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="emh-clubs-shop-products">
          <ul className="emh-clubs-tiles">
            {priceTiles.map((tile) => (
              <li key={tile.name} className="emh-clubs-tile">
                <div className="emh-clubs-tile-art" data-count={tile.cards.length} aria-hidden="true">
                  {tile.cards.map((design, i) => (
                    <img key={i} src={HERO_CARD(design)} alt="" width={400} height={560} loading="lazy" decoding="async" />
                  ))}
                </div>
                <h3>{tile.name}</h3>
                <p className="emh-clubs-tile-price">
                  {tile.price} <span>per card</span>
                </p>
                {tile.note && <p className="emh-clubs-tile-note">{tile.note}</p>}
              </li>
            ))}
            {/* Provisional: the case is not on sale and its price, and whether
                it is included, are undecided. Original illustration only. */}
            <li className="emh-clubs-tile emh-clubs-tile-case">
              <div className="emh-clubs-tile-art" aria-hidden="true">
                <div className="emh-case">
                  <div className="emh-case-label">
                    <span>EMBLEM</span>
                  </div>
                  <div className="emh-case-window">
                    <img src={HERO_CARD('royal')} alt="" width={400} height={560} loading="lazy" decoding="async" />
                  </div>
                </div>
              </div>
              <h3>Protective display case</h3>
              <p className="emh-clubs-tile-preview">Preview — availability to be confirmed</p>
            </li>
          </ul>
          <p className="emh-clubs-shop-rule">
            Your team’s price is set at your deadline by the number of families who have committed. Each family then pays for their own card.
          </p>
          <div className="emh-pricing-note">
            <p className="emh-pricing-reassurance">Digital profile included. No annual subscription.</p>
            <p className="emh-pricing-delivery">Cards are delivered together to your club’s chosen contact. Delivery details are confirmed with you during setup.</p>
          </div>
        </div>
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

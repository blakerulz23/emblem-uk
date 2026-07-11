import Link from 'next/link';

const trust = [
  'Trusted by grassroots clubs',
  'Interactive player profile',
  'Premium collectible finish',
  'Built for families',
];

const colourways = [
  { img: '/hollinwood-card-01.png', name: 'Flame', tint: '#F1874F', alt: 'Orange foil player card' },
  { img: '/hollinwood-card-03.png', name: 'Royal', tint: '#5B8DEF', alt: 'Blue foil player card' },
  { img: '/hollinwood-card-05.png', name: 'Pitch', tint: '#3CC87E', alt: 'Green foil player card' },
  { img: '/hollinwood-card-07.png', name: 'Crimson', tint: '#F0555A', alt: 'Red foil player card' },
  { img: '/hollinwood-card-09.png', name: 'Gold', tint: '#E9B23C', alt: 'Gold foil player card' },
];

const heroStyles = [
  { name: 'Flame', preview: 'linear-gradient(145deg,#f36b28,#1b1110 58%,#0d302a)' },
  { name: 'Royal', preview: 'linear-gradient(145deg,#315dff,#101a3d 56%,#05070c)' },
  { name: 'Pitch', preview: 'linear-gradient(145deg,#39c873,#12482c 58%,#050c08)' },
  { name: 'Gold', preview: 'linear-gradient(145deg,#e9b23c,#59400b 58%,#120d04)' },
  { name: 'Crimson', preview: 'linear-gradient(145deg,#f0555a,#531114 58%,#080607)' },
];

const steps = [
  ['STEP 01', 'Add your player', 'One child, siblings, friends, or the full squad list in a single session.'],
  ['STEP 02', 'Upload the photo', 'One photo or a whole squad. We lift each player cleanly off the background.'],
  ['STEP 03', 'Details & season stats', 'Club, age group, position, shirt number and stats. Pick a design and apply it to every card.'],
  ['STEP 04', 'Approve & print', 'Review every card, fix anything missing, approve the order, and we print and ship.'],
];

const profileItems = [
  'Season stats, updated match by match',
  'Match photos and video highlights',
  'Awards, Player of the Match and milestones',
  'A new chapter added every season',
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

const pillars = [
  ['Play', 'Celebrate every season. Every child gets their own official card and feels like a professional.'],
  ['Remember', 'Preserve the memories for life. Every season becomes permanent: a keepsake, not a camera roll.'],
  ['Belong', 'Strengthen the connection between player, family and club, season after season.'],
];

const tiers = [
  {
    name: 'Single card',
    who: 'One player, one keepsake',
    price: '£24',
    per: 'per card',
    points: ['Premium printed card', 'Interactive digital profile', 'Season stats, photos & highlights'],
    cta: 'Create a card',
    href: '/builder?mode=single',
  },
  {
    name: 'Sibling & friend set',
    who: '3-5 cards in one order',
    price: '£20',
    per: 'per card',
    points: ['Everything in Single', 'One design across the set', 'Grandparent & keepsake copies'],
    cta: 'Build a set',
    href: '/builder?mode=squad',
    featured: true,
  },
  {
    name: 'Team pack',
    who: '10+ players, clubs & squads',
    price: '£15',
    per: 'per player',
    points: ['Club badge & colours on every card', 'Bulk upload and squad approval', 'Duplicate prints per player'],
    cta: 'Build a team pack',
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
            <p className="emh-eyebrow emh-eyebrow-pill">The home of the grassroots player journey</p>
            <h1>
              <span>Premium custom</span>
              <span>football trading cards</span>
            </h1>
            <p className="emh-hero-subline">More than a football card.</p>
            <p className="emh-lede">
              Turn your child&apos;s football photo into a premium printed player card connected to a living digital profile for stats, photos, highlights and memories.
            </p>
            <div className="emh-actions">
              <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Create a card</Link>
              <Link className="emh-btn emh-btn-secondary" href="/builder?mode=squad">Build a team pack</Link>
            </div>
            <div className="emh-hero-swatches" aria-label="Available card styles">
              {heroStyles.map((style) => (
                <span key={style.name}>
                  <i style={{ background: style.preview }} />
                  {style.name}
                </span>
              ))}
            </div>
            <p className="emh-micro">Built in minutes · treasured for years</p>
          </div>

          <div className="emh-card-fan" aria-label="Example Emblem player cards">
            <img className="emh-fan-card emh-fan-card-right" src="/hollinwood-card-05.png" alt="" />
            <img className="emh-fan-card emh-fan-card-left" src="/hollinwood-card-03.png" alt="" />
            <img className="emh-fan-card emh-fan-card-front" src="/hollinwood-card-01.png" alt="Emblem premium collectible player card for Jacob Thompson" />
            <div className="emh-card-orbit emh-card-orbit-one" aria-hidden="true" />
            <div className="emh-card-orbit emh-card-orbit-two" aria-hidden="true" />
            <div className="emh-profile-chip">
              <p>Tap the card</p>
              <span>Profile · Stats · Highlights</span>
            </div>
          </div>
        </div>

        <div className="emh-trust-strip">
          <div>
            {trust.map((label) => (
              <span key={label}><i />{label}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="collection" className="emh-section">
        <div className="emh-section-head">
          <div>
            <p className="emh-eyebrow">The collection</p>
            <h2>A card in your club&apos;s colours.</h2>
          </div>
          <p>Premium foil finishes, the official league crest and your own club badge, printed to last and built to be kept.</p>
        </div>
        <div className="emh-colour-grid">
          {colourways.map((card) => (
            <figure key={card.name}>
              <img src={card.img} alt={card.alt} />
              <figcaption style={{ color: card.tint }}>{card.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="journey" className="emh-section emh-journey">
        <p className="emh-eyebrow">Start your player&apos;s journey</p>
        <h2>Four steps from photo to keepsake.</h2>
        <div className="emh-step-grid">
          {steps.map(([num, title, body]) => (
            <article key={num}>
              <span>{num}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="emh-digital">
        <div>
          <div className="emh-digital-copy">
            <p className="emh-eyebrow">One card, the whole season</p>
            <h2>Printed to keep. Tap for the journey.</h2>
            <p>
              The card is a premium printed keepsake. Tap it with any phone and the player&apos;s digital profile opens instantly, then keeps growing match after match, season after season.
            </p>
            <ul>
              {profileItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <Link className="emh-btn emh-btn-light" href="/builder?mode=single">Start your card</Link>
          </div>
          <div className="emh-digital-cards">
            <img src="/hollinwood-card-07.png" alt="Player card front" />
            <img src="/hollinwood-card-08.png" alt="Player card back showing the tap-to-profile design" />
          </div>
        </div>
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

      <section className="emh-section emh-pillars">
        <h2>Play. <span>Remember.</span> Belong.</h2>
        <p>Not a card company. The company that preserves the journey of grassroots sport.</p>
        <div>
          {pillars.map(([name, body]) => (
            <article key={name}>
              <h3>{name}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="emh-section emh-pricing">
        <p className="emh-eyebrow">Packages</p>
        <h2>From one card to a club order.</h2>
        <p>Every package includes the premium printed card and the interactive digital profile.</p>
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

      <section className="emh-final-cta">
        <img src="/embm.png" alt="Emblem" />
        <h2>Play the season. Remember the journey. Belong forever.</h2>
        <p>Start with one photo. Add the squad later. Everything stays in one order.</p>
        <div className="emh-actions">
          <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Create a card</Link>
          <Link className="emh-btn emh-btn-secondary" href="/builder?mode=squad">Build a team pack</Link>
        </div>
      </section>
    </main>
  );
}

import Link from 'next/link';

const trust = [
  ['400gsm premium stock', 'Built to last'],
  ['Real NFC chip built in', 'Tap to unlock'],
  ['Ships in 5-7 days', 'Fast. Tracked. Reliable.'],
];

const moments = [
  {
    title: 'Every season deserves remembering.',
    body: 'From the first match to the final whistle, capture every moment that makes their journey unforgettable.',
  },
  {
    title: 'Everything in one place.',
    body: 'Photos, videos, goals, stats and milestones stay connected to one card and one profile.',
  },
  {
    title: 'It grows with them.',
    body: 'Add new seasons, new teams and new achievements over time, instead of starting again.',
  },
  {
    title: 'A keepsake for years.',
    body: 'The printed card becomes the thing they can keep, show and return to long after the season ends.',
  },
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
            <h1>
              Premium custom <span>football</span>{' '}
              <br />
              <span>trading cards</span>
            </h1>
          </div>

          <p className="emh-hero-subline">More than a football card.</p>
          <div className="emh-scroll-card-stage" aria-label="Emblem player card preview">
            <div className="emh-scroll-card-perspective">
              <div className="emh-scroll-card-shadow" aria-hidden="true" />
              <div className="emh-scroll-card">
                <img
                  className="emh-hero-slab"
                  src="/assets/card-hero-slab.png"
                  alt="Personalised Emblem football trading card"
                />
                <div className="emh-scroll-card-glare" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="emh-hero-footer">
            <p className="emh-lede">
              Create a personalised football trading card that unlocks a digital collection of every match, photo, goal and milestone so every season is remembered.
            </p>

            <div className="emh-actions">
              <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Upload Photo</Link>
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

      <section id="collection" className="emh-moments-section">
        <div className="emh-moments-inner">
          <div className="emh-moments-head">
            <p className="emh-eyebrow">Why parents love Emblem</p>
            <h2>
              Built for the moments
              <br />
              <span>you&apos;ll want to look back on.</span>
            </h2>
            <p>
              Emblem turns the season into something families can hold, tap and revisit, from muddy matchdays to the goals everyone still talks about.
            </p>
          </div>

          <div className="emh-moments-grid">
            {moments.map((moment, index) => (
              <article key={moment.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{moment.title}</h3>
                <p>{moment.body}</p>
              </article>
            ))}
          </div>
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

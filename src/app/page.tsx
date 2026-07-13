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
  ['1', 'Upload', 'Choose your favourite photo and personalise your card.'],
  ['2', 'Print', 'We professionally print your collectible with premium finishes and a real NFC chip.'],
  ['3', 'Tap', 'Touch your card to your phone to instantly unlock their digital profile and collection.'],
  ['4', 'Grow', 'Add every goal, match, milestone and memory throughout the season. The story keeps growing.'],
];

const profileItems = [
  ['Journey', 'Every season connected.'],
  ['Matches', 'Fixtures and progress together.'],
  ['Photos', 'Every team photo in one place.'],
  ['Highlights', 'Videos from every season.'],
  ['Achievements', 'Every milestone preserved.'],
  ['Teams', 'One profile across every club.'],
];

const profileFeatures = [
  ['Every Match Remembered', 'Keep fixtures, results and season progress connected in one place.'],
  ['Every Season Together', 'Follow their football journey from the very first match onwards.'],
  ['See How They Are Developing', 'Coach-led feedback and progress indicators show how they are growing beyond goals alone.'],
  ['Every Team Connected', 'See the players, manager, fixtures and league position around every season.'],
];

const tickerClubs = [
  'Ashton United',
  'Riverside Rangers',
  'Hollinwood Juniors',
  'Fairfield FC',
  'Surrey Youth League',
  'Meadow Colts',
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

      <section id="journey" className="emh-forever-section">
        <div className="emh-forever-inner">
          <div className="emh-forever-head">
            <h2>From photo to forever.</h2>
            <p>Create a personalised football trading card in four simple steps and unlock a digital collection that grows every season.</p>
          </div>

          <div className="emh-forever-grid">
            {steps.map(([num, title, body]) => (
              <article key={num}>
                <div>
                  <span>{num}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <div className={`emh-step-visual emh-step-visual-${num}`} aria-hidden="true">
                  {num === '1' && <strong>Drop your photo here</strong>}
                  {num === '2' && <strong>Emblem</strong>}
                  {num === '3' && <strong>Tap to unlock</strong>}
                  {num === '4' && (
                    <ul>
                      <li><b>2022/23</b> Joined first club</li>
                      <li><b>2023/24</b> Top goal scorer</li>
                      <li><b>2024/25</b> Player of the season</li>
                      <li><b>2025/26</b> New club, new journey</li>
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="emh-club-ticker" aria-hidden="true">
        <div>
          {[...tickerClubs, ...tickerClubs].map((club, index) => (
            <span key={`${club}-${index}`}>{club}</span>
          ))}
        </div>
      </div>

      <section id="card" className="emh-profile-section">
        <div className="emh-profile-inner">
          <div className="emh-profile-lead">
            <p className="emh-eyebrow">The digital profile</p>
            <h2>
              The card is just the
              <br />
              <span>beginning.</span>
            </h2>
            <p>Every card unlocks a private digital collection that grows with every match, goal, photo and milestone.</p>
            <Link className="emh-btn emh-btn-primary" href="/builder?mode=single">Tap your card to unlock their profile</Link>
          </div>

          <div className="emh-profile-phone" aria-label="Digital profile preview">
            <div className="emh-phone-top" />
            <img src="/hollinwood-card-08.png" alt="Emblem card back linked to a digital profile" />
          </div>

          <div className="emh-profile-explorer">
            <p>Explore their digital collection</p>
            <div className="emh-profile-tabs">
              {profileItems.map(([title, body]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="emh-profile-feature-grid">
              {profileFeatures.map(([title, body]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
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

      <section className="emh-final-cta">
        <img src="/embm.png" alt="Emblem" />
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

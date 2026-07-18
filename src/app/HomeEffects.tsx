'use client';

import Image from 'next/image';
import { MouseEvent, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

type Moment = {
  title: string;
  body: string;
  image?: string;
  isTimeline?: boolean;
};

type ProfileItem = [string, string];
type ProfileFeature = [string, string];
type FaqItem = {
  question: string;
  lead?: string;
  answer?: string;
  chips?: string[];
};
type DigitalMoment = {
  key: string;
  title: string;
  date: string;
  meta: string;
  context: string;
  trust: string;
  official?: boolean;
  about: string;
  stats: [string, string][];
  media: string;
  mediaType: 'image' | 'video';
  mediaAlt: string;
};
type DigitalTabId = 'journey' | 'matches' | 'photos' | 'highlights' | 'achievements' | 'teams';
type DigitalMomentId = 'firstgoal' | 'tournament' | 'teamphoto' | 'captain';

const optimizedAssetPath = '/assets/optimized';

const fanCards = [
  { name: 'Sapphire', src: `${optimizedAssetPath}/card-fan-2.webp` },
  { name: 'Emerald', src: `${optimizedAssetPath}/card-fan-4.webp` },
  { name: 'Floodlight', src: `${optimizedAssetPath}/card-fan-1.webp` },
  { name: 'Cosmic', src: `${optimizedAssetPath}/card-fan-3.webp` },
  { name: 'Orange', src: `${optimizedAssetPath}/card-fan-5.webp` },
];

const nfcScreens = [
  `${optimizedAssetPath}/os-mini-home.webp`,
  `${optimizedAssetPath}/os-mini-card.webp`,
  `${optimizedAssetPath}/os-mini-journey.webp`,
];

const momentArt = [
  `${optimizedAssetPath}/moment-1.webp`,
  `${optimizedAssetPath}/moment-2.webp`,
  `${optimizedAssetPath}/moment-3.webp`,
  `${optimizedAssetPath}/moment-4.webp`,
];

const unlockTabs: { id: DigitalTabId; label: string; iconIndex: number }[] = [
  { id: 'journey', label: 'Journey', iconIndex: 0 },
  { id: 'matches', label: 'Matches', iconIndex: 1 },
  { id: 'photos', label: 'Photos', iconIndex: 2 },
  { id: 'highlights', label: 'Highlights', iconIndex: 3 },
  { id: 'achievements', label: 'Achievements', iconIndex: 4 },
  { id: 'teams', label: 'Teams', iconIndex: 5 },
];

const TAB_TO_MOMENT: Record<DigitalTabId, DigitalMomentId> = {
  journey: 'firstgoal',
  matches: 'tournament',
  photos: 'teamphoto',
  highlights: 'firstgoal',
  achievements: 'tournament',
  teams: 'captain',
};

const digitalMoments: Record<DigitalMomentId, DigitalMoment> = {
  firstgoal: {
    key: 'firstgoal',
    title: 'First Goal',
    date: '12 March 2026',
    meta: 'vs Hyde United',
    context: 'Curzon Ashton Juniors U10',
    trust: 'Coach Verified',
    about: 'Ollie scores his first goal from a corner. Great awareness and a composed finish. A proud moment for the whole family.',
    stats: [['Goal', '1'], ['Assists', '0'], ['Minutes Played', '60'], ['Result', 'Won 3-1']],
    media: '/assets/dp-first-goal.mp4',
    mediaType: 'video',
    mediaAlt: 'First goal video moment',
  },
  teamphoto: {
    key: 'teamphoto',
    title: 'Team Photo',
    date: '22 April 2026',
    meta: 'Presentation Day',
    context: 'Curzon Ashton Juniors U10',
    trust: 'Coach Verified',
    about: 'Every team photo, matchday image and family favourite can sit inside the same digital collection.',
    stats: [['Photos', '24'], ['Squad', '14'], ['Occasion', 'Presentation'], ['Season', '2026']],
    media: `${optimizedAssetPath}/dp-team-photo.webp`,
    mediaType: 'image',
    mediaAlt: 'Team photo moment',
  },
  tournament: {
    key: 'tournament',
    title: 'Tournament Winner',
    date: '7 June 2026',
    meta: 'Summer Shield Final',
    context: 'U10 Champions Cup',
    trust: 'Official Club',
    official: true,
    about: 'A final win, a clean-sheet run and a trophy moment stored against the player card forever.',
    stats: [['Result', 'Won 3-1'], ['Clean Sheets', '2'], ['Round', 'Final'], ['Trophy', 'Winners']],
    media: `${optimizedAssetPath}/dp-tournament-winner.webp`,
    mediaType: 'image',
    mediaAlt: 'Tournament winner moment',
  },
  captain: {
    key: 'captain',
    title: 'Captain',
    date: '15 September 2027',
    meta: 'vs Ashton United',
    context: 'Official Club',
    trust: 'Official Club',
    official: true,
    about: 'A leadership milestone preserved with the match context, team story and people who helped shape the moment.',
    stats: [['Role', 'Captain'], ['Season', '2027'], ['Team', 'U11'], ['Match', 'Ashton United']],
    media: `${optimizedAssetPath}/dp-captain.webp`,
    mediaType: 'image',
    mediaAlt: 'Captain milestone moment',
  },
};

const timelineGroups: { year: string; moments: DigitalMomentId[] }[] = [
  { year: '2026', moments: ['firstgoal', 'teamphoto', 'tournament'] },
  { year: '2027', moments: ['captain'] },
];

const whyProfileMatters: ProfileFeature[] = [
  ['Every Match Remembered', 'Fixtures, results, goals and assists - all in one place.'],
  ['Every Memory Saved', 'Photos and videos that turn moments into memories.'],
  ['Growth You Can See', 'Stats, feedback and progress that show how they are developing.'],
  ['One Story. Every Team', 'All clubs. All seasons. One profile that grows forever.'],
];

const faqItems: FaqItem[] = [
  {
    question: 'Is this just a football card?',
    lead: 'No.',
    answer:
      'Every Emblem card includes a real NFC chip that unlocks a private digital profile. As your child plays, new photos, milestones, videos and achievements are added to the same profile, season after season.',
  },
  {
    question: 'Do I need an app?',
    lead: 'No.',
    answer: 'Simply tap the card with any compatible smartphone to open the digital profile instantly.',
  },
  {
    question: 'What happens next season?',
    lead: 'The journey continues.',
    answer:
      'You do not start again. New seasons are simply added to the same player profile, building one complete football story over time.',
  },
  {
    question: 'What can I add?',
    lead: 'Everything that tells their story.',
    chips: [
      'Match photos',
      'Goals',
      'Highlights',
      'Awards',
      'Team photos',
      'Tournament wins',
      'Player of the Match',
      'Season statistics',
      'New clubs',
      'Every new season',
    ],
  },
  {
    question: 'Is it private?',
    lead: 'You decide.',
    answer: 'Profiles are private by default and only shared with the people you choose.',
  },
  {
    question: 'How long does shipping take?',
    answer: 'Most cards are printed and dispatched within 5-7 working days.',
  },
  {
    question: 'Can I order a whole team?',
    lead: 'Absolutely.',
    answer: 'We create individual cards for entire squads, academies and football clubs.',
  },
  {
    question: 'What if they become a professional?',
    lead: 'Their story has already begun.',
    answer:
      'Their first season, first goal, first trophy and first team are already preserved forever. Every new chapter simply builds on the same journey.',
  },
];

function ProfileIcon({ index }: { index: number }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const icons = [
    <><path {...common} d="M7 6h10v12H7z" /><path {...common} d="M10 10h4" /><path {...common} d="M10 14h3" /></>,
    <><path {...common} d="M6 8h12v10H6z" /><path {...common} d="M9 5v4" /><path {...common} d="M15 5v4" /><path {...common} d="M6 11h12" /></>,
    <><path {...common} d="M6 7h12v10H6z" /><path {...common} d="m8 15 3-3 2 2 2-3 3 4" /><circle {...common} cx="10" cy="10" r="1" /></>,
    <><path {...common} d="M6 8h12v9H6z" /><path {...common} d="m11 10 4 2.5-4 2.5z" /></>,
    <><path {...common} d="M8 7h8" /><path {...common} d="M10 7v3a4 4 0 1 0 4 0V7" /><path {...common} d="M12 14v4" /><path {...common} d="M9 18h6" /></>,
    <><circle {...common} cx="9" cy="10" r="2.5" /><circle {...common} cx="15" cy="10" r="2.5" /><path {...common} d="M5 18c.7-2.6 2.1-4 4-4" /><path {...common} d="M19 18c-.7-2.6-2.1-4-4-4" /></>,
  ];

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {icons[index % icons.length]}
    </svg>
  );
}

function NfcIcon() {
  return (
    <svg aria-hidden="true" className="emh-dp-toggle-icon" viewBox="0 0 24 24">
      <path d="M6.4 8.2c1.2 2.4 1.2 5.2 0 7.6" />
      <path d="M10.4 6c1.9 3.7 1.9 8.3 0 12" />
      <path d="M14.3 4.2c2.6 4.9 2.6 10.7 0 15.6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="emh-dp-toggle-chevron" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function HeroCardShowcase() {
  const [order, setOrder] = useState([0, 1, 2, 3, 4]);
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [nfc, setNfc] = useState({ active: false, x: 50, y: 46 });
  const [isCompact, setIsCompact] = useState(false);

  const centered = order[Math.floor(order.length / 2)];

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 700);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function shuffleFan() {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
  }

  function selectCard(index: number) {
    if (index === centered) {
      shuffleFan();
      return;
    }

    const next = order.filter((item) => item !== index);
    next.splice(Math.floor((next.length + 1) / 2), 0, index);
    setOrder(next);
  }

  function handleTilt(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 7, y: px * 9 });
  }

  function handleNfcMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setNfc({
      active: true,
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div className="emh-hero-fan-stage" aria-label="Interactive Emblem player card fan">
      <div
        className="emh-hero-fan-wrap"
        onMouseEnter={() => setHovered(true)}
        onMouseMove={handleTilt}
        onMouseLeave={() => {
          setHovered(false);
          setTilt({ x: 0, y: 0 });
          setNfc((value) => ({ ...value, active: false }));
        }}
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <div className="emh-fan-ground-shadow" aria-hidden="true" />
        <div className="emh-fan-cards">
          {fanCards.map((card, index) => {
            const position = order.indexOf(index);
            const slot = position - Math.floor(order.length / 2);
            const distance = Math.abs(slot);
            const spread = isCompact ? (hovered ? 24 : 20) : (hovered ? 36 : 30);
            const isCenter = slot === 0;
            const transform = isCenter
              ? 'translateX(-50%) translateY(-22px) rotate(0deg) scale(1.07)'
              : `translateX(calc(-50% + ${slot * spread}px)) translateY(${distance * 14}px) rotate(${slot * (hovered ? 9 : 7)}deg) scale(${1 - distance * 0.06})`;

            return (
              <button
                key={card.name}
                className="emh-fan-card-button"
                type="button"
                aria-label={`${card.name} edition card preview`}
                onClick={() => selectCard(index)}
                style={{
                  transform,
                  zIndex: isCenter ? 30 : 12 - distance,
                  filter: `brightness(${isCenter ? 1 : 1 - distance * 0.12})`,
                }}
              >
                <img
                  src={card.src}
                  alt={`${card.name} Emblem card`}
                  loading={isCenter ? 'eager' : 'lazy'}
                  decoding={isCenter ? 'sync' : 'async'}
                />
              </button>
            );
          })}
        </div>

        <div
          className="emh-nfc-hotspot"
          onMouseEnter={() => setNfc((value) => ({ ...value, active: true }))}
          onMouseMove={handleNfcMove}
          onMouseLeave={() => setNfc((value) => ({ ...value, active: false }))}
          aria-hidden="true"
        >
          <span />
        </div>

        <div className={`emh-nfc-overlay ${nfc.active ? 'is-active' : ''}`} aria-hidden="true">
          <div className="emh-nfc-glow" style={{ left: `${nfc.x}%`, top: `${nfc.y}%` }} />
          {nfcScreens.map((src, index) => (
            <img
              key={src}
              src={src}
              alt=""
              className={`emh-nfc-mini emh-nfc-mini-${index + 1}`}
              style={{ left: `${nfc.x}%`, top: `${nfc.y}%` }}
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
      </div>

      <p className="emh-hero-edition-note">
        <span />
        {fanCards[centered].name} edition - tap to shuffle, hover to unlock
      </p>
    </div>
  );
}

export function MomentsExplorer({ moments }: { moments: Moment[] }) {
  const [active, setActive] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const momentDetails = moments.map((moment, index) => ({
    ...moment,
    image: moment.image ?? momentArt[index % momentArt.length],
    category: ['The first season', 'One living profile', 'Season after season', 'A lifetime later'][index] || 'Emblem moment',
    long: [
      [
        'Grassroots football moves fast. One season your child is nervous on the touchline, the next they are captain leading the walk-out.',
        'Emblem holds onto the debut, the muddy cup run and the goal that made the whole sideline erupt, so none of it is lost to a full camera roll.',
      ],
      [
        'No more scattered group chats, lost WhatsApp videos and forgotten camera rolls. Every photo, clip and milestone lives on one profile that the whole family can see.',
        'Parents, grandparents and coaches can all return to the same story, season after season.',
      ],
      [
        '2022/23: joined their first club. 2023/24: top goal scorer. 2024/25: player of the season. 2025/26: new club, new journey.',
        'Emblem turns years of football into one continuous timeline. The card in their hand becomes more valuable every season they play.',
      ],
      [
        'One day they will be grown up, and this card will be the thing they pull out to show where it started.',
        'That is what Emblem is really for: not just the stats, but the memory of being small, muddy and completely in love with the game.',
      ],
    ][index] || [moment.body],
    isTimeline: moment.isTimeline ?? index === 2,
  }));
  const openedMoment = openIndex === null ? null : momentDetails[openIndex];

  function scrollRail(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * 460, behavior: 'smooth' });
  }

  return (
    <div className="emh-moment-rail-shell">
      <div className="emh-rail-controls">
        <button type="button" aria-label="Previous moment" onClick={() => scrollRail(-1)}>{'<'}</button>
        <button type="button" aria-label="Next moment" onClick={() => scrollRail(1)}>{'>'}</button>
      </div>

      <div ref={railRef} className="emh-moment-rail">
        {momentDetails.map((moment, index) => (
          <button
            key={moment.title}
            className={`emh-moment-card ${moment.isTimeline ? 'emh-moment-card-timeline' : ''} ${moment.image && !moment.body ? 'emh-moment-card-visual' : ''}`}
            type="button"
            aria-pressed={active === index}
            onClick={() => {
              setActive(index);
              setOpenIndex(index);
            }}
            >
            {!moment.isTimeline && <img className="emh-moment-card-image" src={moment.image} alt="" loading="lazy" decoding="async" />}
            {moment.title === 'Keeps growing.' && (
              <img
                className="emh-moment-growth-overlay"
                src="/assets/moment-growth-overlay.png"
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>
              {moment.title === 'Keeps growing.' ? (
                <>
                  Keeps <strong>growing.</strong>
                </>
              ) : (
                moment.title
              )}
            </h3>
            {moment.body && <p>{moment.body}</p>}
            {moment.isTimeline && (
              <div className="emh-moment-season-line" aria-hidden="true">
                {['2022/23 Joined first club', '2023/24 Top goal scorer', '2024/25 Player of the season', '2025/26 New club, new journey'].map((row) => (
                  <small key={row}>{row}</small>
                ))}
              </div>
            )}
            <em>Tap to expand</em>
          </button>
        ))}
      </div>

      {openedMoment && (
        <div className="emh-moment-modal" role="dialog" aria-modal="true" aria-label={openedMoment.title} onClick={() => setOpenIndex(null)}>
          <div className="emh-moment-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="emh-moment-modal-hero" style={{ backgroundImage: `url(${openedMoment.image})` }}>
              <button type="button" aria-label="Close moment" onClick={() => setOpenIndex(null)}>x</button>
            </div>
            <div className="emh-moment-modal-copy">
              <p>{openedMoment.category}</p>
              <h3>{openedMoment.title}</h3>
              {openedMoment.long.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DigitalProfilePreview(props: {
  items: ProfileItem[];
  features: ProfileFeature[];
}) {
  void props;

  const [activeTab, setActiveTab] = useState<DigitalTabId>('journey');
  const [activeMomentId, setActiveMomentId] = useState<DigitalMomentId>('firstgoal');
  const [isRevealOpen, setIsRevealOpen] = useState(false);
  const revealRef = useRef<HTMLDivElement | null>(null);
  const activeMoment = digitalMoments[activeMomentId];

  function pickMoment(momentId: DigitalMomentId) {
    setActiveMomentId(momentId);
  }

  function pickTab(tabId: DigitalTabId) {
    setActiveTab(tabId);
    pickMoment(TAB_TO_MOMENT[tabId]);
  }

  function toggleReveal() {
    setIsRevealOpen((open) => {
      const shouldOpen = !open;

      if (shouldOpen) {
        window.setTimeout(() => {
          revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }

      return shouldOpen;
    });
  }

  return (
    <div className="emh-profile-explorer">
      <div className="emh-dp-intro">
        <div className="emh-dp-intro-copy emh-dp-intro-copy-full">
          <p className="emh-eyebrow">The digital profile</p>
          <h2>
            The card is just the
            <span> beginning.</span>
          </h2>
          <p>Every card unlocks a private digital collection that grows with every match, goal, photo and milestone.</p>
          <button
            className="emh-btn emh-btn-primary emh-dp-toggle"
            type="button"
            aria-controls="dpReveal"
            aria-expanded={isRevealOpen}
            onClick={toggleReveal}
          >
            <NfcIcon />
            <span className="emh-dp-toggle-label">
              {isRevealOpen ? 'Hide the collection' : 'See everything the card unlocks'}
            </span>
            <ChevronIcon />
          </button>
          <small>Private. Secure. Always theirs.</small>
        </div>

        <div className="emh-dp-reveal" aria-label="Physical card unlocking a phone profile">
          <img
            className="emh-dp-reveal-card"
            src={`${optimizedAssetPath}/dp-profile-slab.webp`}
            alt="Graded Emblem player card"
            loading="lazy"
            decoding="async"
          />
          <span className="emh-dp-nfc" aria-hidden="true"><span /><span /></span>
          <img
            className="emh-dp-reveal-phone"
            src={`${optimizedAssetPath}/eos-home.webp`}
            alt="Emblem digital profile on a phone"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>

      <div ref={revealRef} id="dpReveal" className={`emh-dp-reveal-shell ${isRevealOpen ? 'is-open' : ''}`}>
        <div className="emh-unlock-tabs" role="tablist" aria-label="Digital profile areas">
          {unlockTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => pickTab(tab.id)}
            >
              <ProfileIcon index={tab.iconIndex} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="emh-unlock-card">
          <div className="emh-unlock-timeline">
            <p className="emh-dp-panel-label">Journey timeline</p>
            {timelineGroups.map((group) => (
              <div className="emh-unlock-timeline-group" key={group.year}>
                <h3>{group.year}</h3>
                {group.moments.map((momentId, index) => {
                  const moment = digitalMoments[momentId];
                  return (
                    <button
                      key={moment.key}
                      type="button"
                      aria-pressed={activeMomentId === momentId}
                      onClick={() => pickMoment(momentId)}
                    >
                      <span>
                        <ProfileIcon index={index} />
                      </span>
                      <strong>{moment.title}</strong>
                      <small>{moment.date}</small>
                      <em className={moment.official ? 'is-official' : ''}>{moment.trust}</em>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="emh-unlock-media">
            <div className="emh-unlock-video emh-unlock-media-card">
              {activeMoment.mediaType === 'video' ? (
                <video
                  key={activeMoment.media}
                  src={activeMoment.media}
                  aria-label={activeMoment.mediaAlt}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={activeMoment.media} alt={activeMoment.mediaAlt} loading="lazy" decoding="async" />
              )}
              <span className={`emh-unlock-media-badge ${activeMoment.official ? 'is-official' : ''}`}>
                <ProfileIcon index={activeMoment.official ? 4 : 2} />
                {activeMoment.trust}
              </span>
              <div className="emh-unlock-media-caption">
                <div>
                  <h3>{activeMoment.title}</h3>
                  <p>
                    {activeMoment.date}
                    <span aria-hidden="true"> . </span>
                    {activeMoment.context}
                    <span aria-hidden="true"> . </span>
                    {activeMoment.trust}
                  </p>
                </div>
                <div className="emh-unlock-media-actions" aria-hidden="true">
                  <span>DL</span>
                  <span>FS</span>
                  <span>SH</span>
                </div>
              </div>
            </div>
          </div>

          <div className="emh-unlock-about">
            <p className="emh-dp-panel-label">About this moment</p>
            <p>{activeMoment.about}</p>
            <p className="emh-dp-panel-label">Key stats</p>
            <div className="emh-dp-stat-list">
              {activeMoment.stats.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <button type="button">Share Moment</button>
          </div>
        </div>
      </div>

      <div id="journey" className="emh-dp-why emh-dp-why-restored">
        <p className="emh-dp-panel-label">Why it matters</p>
        <div className="emh-dp-why-grid">
          {whyProfileMatters.map(([title, body], index) => (
            <article key={title}>
              <span>
                <ProfileIcon index={index + 1} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

const dpAssetPath = '/assets/optimized';
const dpWordmarkPath = '/assets/digital-profile/emblem-wordmark.png';

const dpWhyCards = [
  ['Every Match Remembered', 'Fixtures, results, goals and assists - all in one place.'],
  ['Every Memory Saved', 'Photos and videos that turn moments into memories.'],
  ['Growth You Can See', 'Stats, feedback and progress that show how they are developing.'],
  ['One Story. Every Team.', 'All clubs. All seasons. One profile that grows forever.'],
] as const;

const stepCards = [
  {
    number: '1',
    title: 'Upload',
    body: 'Choose your favourite photo and personalise your card.',
    action: undefined,
  },
  {
    number: '2',
    title: 'Print',
    body: 'We professionally print your collectible with premium finishes and a real NFC chip.',
    action: undefined,
  },
  {
    number: '3',
    title: 'Tap',
    body: 'Touch your card to your phone to instantly unlock their digital profile and collection.',
    action: 'Try it ->',
  },
] as const;

export function HowItWorksSection() {
  const goToDigital = () => {
    window.dispatchEvent(new CustomEvent('emblem-dp-hint'));
    document.getElementById('card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="emh-hiw-inner">
      <div className="emh-hiw-head">
        <p className="emh-eyebrow">How it works.</p>
        <h2>Easy as 1, 2, 3.</h2>
      </div>
      <div className="emh-hiw-grid">
        {stepCards.map((step) => (
          <StepCard key={step.number} step={step} onTry={step.number === '3' ? goToDigital : undefined} />
        ))}
      </div>
    </div>
  );
}

function StepCard({
  step,
  onTry,
}: {
  step: (typeof stepCards)[number];
  onTry?: () => void;
}) {
  const content = (
    <>
      <span className="emh-hiw-number">{step.number}</span>
      <h3>{step.title}</h3>
      <p>
        {step.body}
        {step.action && <span> {step.action}</span>}
      </p>
      <div className={`emh-hiw-visual emh-hiw-visual-${step.number}`} aria-hidden="true">
        {step.number === '1' && (
          <span className="emh-hiw-upload-mark">
            <svg viewBox="0 0 24 24">
              <path d="M12 16V5m0 0 4.2 4.2M12 5 7.8 9.2M5 18.5h14" />
            </svg>
          </span>
        )}
        {step.number === '2' && (
          <Image src={`${dpAssetPath}/hiw-consistent-card.webp`} alt="" width={420} height={599} loading="lazy" sizes="(max-width: 760px) 42vw, 260px" />
        )}
        {step.number === '3' && (
          <>
            <Image src={`${dpAssetPath}/hiw-consistent-card.webp`} alt="" width={420} height={599} loading="lazy" sizes="(max-width: 760px) 38vw, 220px" />
            <span className="emh-hiw-nfc"><i /><i /><i /></span>
            <Image src={`${dpAssetPath}/eos-home.webp`} alt="" width={180} height={360} loading="lazy" sizes="(max-width: 760px) 32vw, 180px" />
          </>
        )}
      </div>
    </>
  );

  if (onTry) {
    return (
      <button type="button" className="emh-hiw-card emh-hiw-card-button" onClick={onTry}>
        {content}
      </button>
    );
  }

  return <article className="emh-hiw-card">{content}</article>;
}

export function DigitalProfileSection() {
  const [unlocked, setUnlocked] = useState(false);
  const [booting, setBooting] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const introRef = useRef<HTMLDivElement>(null);
  const stageAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onHint = () => {
      setHinting(true);
      window.setTimeout(() => setHinting(false), 1300);
    };
    window.addEventListener('emblem-dp-hint', onHint);
    return () => window.removeEventListener('emblem-dp-hint', onHint);
  }, []);

  const unlock = (scroll = false) => {
    if (unlocked || booting) {
      return;
    }
    if (reducedMotion) {
      setUnlocked(true);
      if (scroll) window.setTimeout(() => stageAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return;
    }
    setBooting(true);
    window.setTimeout(() => {
      setBooting(false);
      setUnlocked(true);
      // Scroll into the cinematic stage (beat 0), not the old tabbed
      // collection panel (#dpReveal) — that now sits after the stage.
      if (scroll) window.setTimeout(() => stageAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }, 900);
  };

  // Hard gate: while locked, clamp scroll so the drag/tap-to-unlock UI stays
  // centred in view. Never engages under reduced-motion, so those visitors
  // are never trapped (no-JS/no-motion accessibility fallback).
  useEffect(() => {
    if (unlocked || reducedMotion) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const wrap = introRef.current;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        const docCenter = r.top + window.scrollY + r.height / 2;
        const gateMax = docCenter - window.innerHeight / 2;
        if (window.scrollY > gateMax + 4) {
          window.scrollTo(0, gateMax);
          window.dispatchEvent(new CustomEvent('emblem-dp-hint'));
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [unlocked, reducedMotion]);

  return (
    <div className="emh-dp2">
      <div ref={introRef} className="emh-dp2-intro">
        <div className="emh-dp2-copy">
          <p className="emh-dp2-eyebrow">The digital profile</p>
          <h2>The card is just the <span>beginning.</span></h2>
          <p>Every card unlocks a private digital collection that grows with every match, goal, photo and milestone.</p>
          {!unlocked && (
            <button type="button" className="emh-dp2-toggle" onClick={() => unlock(true)}>
              <NfcIcon />
              <span>See everything the card unlocks</span>
              <ChevronIcon />
            </button>
          )}
          <div className="emh-dp2-private">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
            </svg>
            Private. Secure. Always theirs.
          </div>
        </div>
        <CardPhoneReveal booting={booting} hinting={hinting} unlocked={unlocked} onUnlock={() => unlock(true)} />
      </div>

      <div ref={stageAnchorRef}>
        <DigitalProfileStage armed={unlocked} reducedMotion={reducedMotion} />
      </div>

      <ClosingStatement />
      <WhyItMatters />
    </div>
  );
}

function CardPhoneReveal({
  booting,
  hinting,
  unlocked,
  onUnlock,
}: {
  booting: boolean;
  hinting: boolean;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ target: 'card' | 'phone'; startX: number; startY: number; x: number; y: number } | null>(null);
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [phoneOffset, setPhoneOffset] = useState({ x: 0, y: 0 });

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag || unlocked) return;
    const next = {
      x: drag.x + clientX - drag.startX,
      y: drag.y + clientY - drag.startY,
    };
    if (drag.target === 'card') setCardOffset(next);
    else setPhoneOffset(next);
  }, [unlocked]);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || unlocked) return;
    dragRef.current = null;

    const card = cardRef.current?.getBoundingClientRect();
    const phone = phoneRef.current?.getBoundingClientRect();
    const overlaps =
      card &&
      phone &&
      card.left < phone.right - 40 &&
      card.right > phone.left + 40 &&
      card.top < phone.bottom - 40 &&
      card.bottom > phone.top + 40;

    if (overlaps) {
      setCardOffset({ x: 0, y: 0 });
      setPhoneOffset({ x: 0, y: 0 });
      onUnlock();
    }
  }, [onUnlock, unlocked]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => moveDrag(event.clientX, event.clientY);
    const handlePointerEnd = () => finishDrag();

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [finishDrag, moveDrag]);

  const onPointerDown = (target: 'card' | 'phone') => (event: PointerEvent<HTMLDivElement>) => {
    if (unlocked) return;
    const offset = target === 'card' ? cardOffset : phoneOffset;
    dragRef.current = { target, startX: event.clientX, startY: event.clientY, x: offset.x, y: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    moveDrag(event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    finishDrag();
  };

  return (
    <div className={`emh-dp2-device ${booting ? 'is-booting' : ''} ${unlocked ? 'is-unlocked' : ''} ${hinting ? 'is-hinting' : ''}`}>
      <div
        ref={cardRef}
        className="emh-dp2-card-drag"
        onPointerDown={onPointerDown('card')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform: `translate(calc(var(--emh-dp2-card-base-x, 0px) + ${cardOffset.x}px), ${cardOffset.y}px) rotate(-5deg)` }}
      >
        <Image
          src={`${dpAssetPath}/dp-profile-slab.webp`}
          alt="Physical Emblem slab card"
          width={1023}
          height={1537}
          loading="lazy"
          sizes="(max-width: 760px) 62vw, 300px"
          draggable={false}
        />
      </div>
      <span className="emh-dp2-rings" aria-hidden="true"><i /><i /></span>
      <div
        ref={phoneRef}
        className="emh-dp2-phone-drag"
        onClick={() => !unlocked && onUnlock()}
        onPointerDown={onPointerDown('phone')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform: `translate(${phoneOffset.x}px, ${phoneOffset.y}px)` }}
      >
        <Image src={`${dpAssetPath}/eos-home.webp`} alt="Emblem digital profile on phone" width={390} height={780} loading="lazy" sizes="(max-width: 760px) 56vw, 260px" draggable={false} />
        <div className="emh-dp2-boot">
          <Image src={dpWordmarkPath} alt="" width={120} height={32} loading="lazy" sizes="120px" />
          <i />
        </div>
        {!unlocked && <span className="emh-dp2-drag-badge">Drag to the card</span>}
      </div>
      {!unlocked && <span className="emh-dp2-drag-hint">Drag the phone to the card</span>}
    </div>
  );
}

const dpStageAssetPath = '/assets/digital-profile';

type DpStageBeat = {
  eyebrow: string;
  lines: string[];
  accent?: string;
  body: string;
};

const dpStageBeats: DpStageBeat[] = [
  { eyebrow: 'YOUR SEASON', lines: ['Every season', 'begins here.'], body: 'Their football identity, latest fixture and latest achievement — everything in one place, the moment they tap in.' },
  { eyebrow: 'DEVELOPMENT', lines: ['Watch their', 'game develop.'], body: 'Every match helps shape their football journey. Coach feedback and development become part of the story.' },
  { eyebrow: 'RECOGNITION', lines: ['Celebrate moments', 'that matter.'], body: 'Trusted by coaches. Shared with families. Remembered forever.' },
  { eyebrow: 'THE COLLECTION', lines: ['Every moment', 'becomes collectible.'], body: 'Every verified milestone becomes a permanent part of their football story.' },
  { eyebrow: 'ONE PERMANENT KEY', lines: ['One card.'], accent: 'Every football moment.', body: 'The card stays with them. The football story keeps growing.' },
];

const dpStageScreens = ['home', 'attributes', 'recognition', 'collection'] as const;
type DpStageScreen = (typeof dpStageScreens)[number];

function DigitalProfileStage({ armed, reducedMotion }: { armed: boolean; reducedMotion: boolean }) {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const beatRef = useRef(-1);
  const didRef = useRef<Record<number, boolean>>({});

  const setRef = (key: string) => (el: HTMLElement | null) => {
    refs.current[key] = el;
  };

  const setText = (key: string, value: string) => {
    const el = refs.current[key];
    if (el) el.textContent = value;
  };
  const setWidth = (key: string, value: string) => {
    const el = refs.current[key] as HTMLElement | null;
    if (el) el.style.width = value;
  };

  const popRecognition = () => {
    const badge = refs.current.recBadge;
    if (badge) {
      badge.style.transform = 'scale(.4)';
      requestAnimationFrame(() => { badge.style.transform = 'scale(1)'; });
    }
    const c = refs.current.confetti;
    if (!c) return;
    c.innerHTML = '';
    const cols = ['#EF6C2F', '#E8B23A', '#F4E9CE', '#46B36B'];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      const x = Math.random() * 100;
      const dur = 1.5 + Math.random() * 1.4;
      const dl = Math.random() * 0.5;
      const sz = 5 + Math.random() * 5;
      s.className = 'emh-dp2-confetti-bit';
      s.style.cssText = `left:${x}%;width:${sz}px;height:${sz * 1.4}px;background:${cols[i % 4]};animation-duration:${dur}s;animation-delay:${dl}s;`;
      c.appendChild(s);
    }
  };

  const setBeat = (b: number) => {
    for (let i = 0; i < 5; i++) {
      const beatEl = refs.current[`beat-${i}`];
      if (beatEl) {
        beatEl.style.opacity = i === b ? '1' : '0';
        beatEl.style.transform = i === b ? 'translateY(0)' : 'translateY(14px)';
        beatEl.style.pointerEvents = i === b ? 'auto' : 'none';
      }
      const dot = refs.current[`dot-${i}`];
      if (dot) dot.style.background = i === b ? '#EF6C2F' : 'rgba(255,255,255,.16)';
    }
    const screenFor = dpStageScreens[b] as DpStageScreen | undefined;
    dpStageScreens.forEach((name) => {
      const el = refs.current[`screen-${name}`];
      if (el) el.style.opacity = name === screenFor ? '1' : '0';
    });
    const phone = refs.current.stagePhone;
    const card = refs.current.stageCard;
    if (b === 4) {
      if (phone) { phone.style.opacity = '0'; phone.style.transform = 'scale(.92) translateY(12px)'; }
      if (card) { card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(1.2)'; card.style.filter = 'drop-shadow(0 34px 66px rgba(239,108,47,.4))'; }
    } else {
      if (phone) { phone.style.opacity = '1'; phone.style.transform = 'none'; }
      if (card) { card.style.left = '2%'; card.style.transform = 'translateY(-50%) rotate(-6deg)'; card.style.filter = 'drop-shadow(0 24px 48px rgba(0,0,0,.7))'; }
    }

    const did = didRef.current;
    if (b === 1 && !did[1]) {
      did[1] = true;
      window.setTimeout(() => {
        setText('attrOverall', '88');
        setText('attrPass', '89');
        setText('attrVis', '88');
        setWidth('barPass', '89%');
        setWidth('barVis', '88%');
        setWidth('barDrib', '86%');
      }, 220);
    }
    if (b === 2 && !did[2]) {
      did[2] = true;
      popRecognition();
    }
    if (b === 3 && !did[3]) {
      did[3] = true;
      window.setTimeout(() => {
        const nw = refs.current.collectionNew;
        const lk = refs.current.collectionLock;
        if (lk) lk.style.opacity = '0';
        if (nw) { nw.style.opacity = '1'; nw.style.transform = 'translateY(0) scale(1)'; }
        setText('collectionCount', '12');
        setText('collectionPct', '86%');
        const ring = refs.current.collectionRing as unknown as SVGCircleElement | null;
        if (ring) ring.style.strokeDashoffset = '28';
      }, 260);
    }
    if (b < 3 && did[3]) {
      did[3] = false;
      const nw = refs.current.collectionNew;
      const lk = refs.current.collectionLock;
      if (nw) { nw.style.opacity = '0'; nw.style.transform = 'translateY(18px) scale(.9)'; }
      if (lk) lk.style.opacity = '1';
      setText('collectionCount', '11');
      setText('collectionPct', '72%');
      const ring = refs.current.collectionRing as unknown as SVGCircleElement | null;
      if (ring) ring.style.strokeDashoffset = '56';
    }
  };

  useEffect(() => {
    if (!armed || reducedMotion) return;
    beatRef.current = -1;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const stageEl = stageWrapRef.current;
        if (!stageEl) return;
        const vh = window.innerHeight;
        const rect = stageEl.getBoundingClientRect();
        const range = Math.max(1, stageEl.offsetHeight - vh);
        let p = -rect.top / range;
        p = Math.max(0, Math.min(0.9999, p));
        const beat = Math.min(4, Math.floor(p * 5));
        if (beat === beatRef.current) return;
        beatRef.current = beat;
        setBeat(beat);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="emh-dp2-stage emh-dp2-stage-static" aria-hidden={!armed}>
        {dpStageBeats.map((beat, i) => (
          <div key={beat.eyebrow} className="emh-dp2-beat-static">
            <p className="emh-dp2-eyebrow">{beat.eyebrow}</p>
            <h3>
              {beat.lines.map((line) => <span key={line}>{line}<br /></span>)}
              {beat.accent && <span className="emh-dp2-accent">{beat.accent}</span>}
            </h3>
            <p>{beat.body}</p>
            {i === 0 && (
              <img className="emh-dp2-stage-static-phone" src={`${dpStageAssetPath}/eos-home.png`} alt="Emblem digital profile home screen" loading="lazy" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={stageWrapRef} className="emh-dp2-stage" data-armed={armed ? '1' : undefined} aria-hidden={!armed}>
      <div className="emh-dp2-pin">
        <div className="emh-dp2-pin-inner">
          <div className="emh-dp2-copy-col">
            {dpStageBeats.map((beat, i) => (
              <div key={beat.eyebrow} ref={setRef(`beat-${i}`)} className="emh-dp2-beat" style={{ opacity: i === 0 ? 1 : 0, transform: i === 0 ? 'translateY(0)' : 'translateY(14px)' }}>
                <p className="emh-dp2-eyebrow">{beat.eyebrow}</p>
                <h3>
                  {beat.lines.map((line) => <span key={line}>{line}<br /></span>)}
                  {beat.accent && <span className="emh-dp2-accent">{beat.accent}</span>}
                </h3>
                <p>{beat.body}</p>
              </div>
            ))}
            <div className="emh-dp2-dots">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} ref={setRef(`dot-${i}`)} className="emh-dp2-dot" style={{ background: i === 0 ? '#EF6C2F' : 'rgba(255,255,255,.16)' }} />
              ))}
            </div>
          </div>

          <div className="emh-dp2-phone-col">
            <img ref={setRef('stageCard') as unknown as (el: HTMLImageElement | null) => void} className="emh-dp2-stage-card" src={`${dpStageAssetPath}/card-slab-graded.png`} alt="Physical Emblem card" />
            <div ref={setRef('stagePhone')} className="emh-dp2-stage-phone">
              <div className="emh-dp2-notch" />
              <div className="emh-dp2-screens">
                <div ref={setRef('screen-home')} className="emh-dp2-screen" style={{ opacity: 1 }} data-screen="home">
                  <div className="emh-dp2-screen-topbar"><span>EMBLEM</span><i /></div>
                  <div className="emh-dp2-home-card">
                    <div className="emh-dp2-home-position">MIDFIELDER</div>
                    <div className="emh-dp2-home-name">OLLIE<br />HARRISON</div>
                    <div className="emh-dp2-home-club"><img src={`${dpStageAssetPath}/club-badge.png`} alt="" />Curzon Ashton U10</div>
                    <div className="emh-dp2-home-overall-label">OVERALL</div>
                    <div className="emh-dp2-home-overall">87</div>
                    <img className="emh-dp2-home-player" src={`${dpStageAssetPath}/player-ollie.png`} alt="" />
                  </div>
                  <div className="emh-dp2-screen-label">TODAY&apos;S ACTIVITY</div>
                  <div className="emh-dp2-home-match">
                    <span className="emh-dp2-home-match-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                    </span>
                    <div><div>Match today</div><small>10:30 · vs Hyde United</small></div>
                  </div>
                  <div className="emh-dp2-home-progress">
                    <div><span>SEASON PROGRESS</span><span>63%</span></div>
                    <div className="emh-dp2-home-progress-track"><div style={{ width: '63%' }} /></div>
                  </div>
                </div>

                <div ref={setRef('screen-attributes')} className="emh-dp2-screen" style={{ opacity: 0 }} data-screen="attributes">
                  <div className="emh-dp2-screen-label">ATTRIBUTES</div>
                  <div className="emh-dp2-attr-head">
                    <div><div className="emh-dp2-attr-name">OLLIE<br />HARRISON</div><div className="emh-dp2-attr-role">MIDFIELDER</div></div>
                    <div className="emh-dp2-attr-overall"><span>OVERALL</span><strong ref={setRef('attrOverall')}>87</strong><em>+5 THIS SEASON</em></div>
                  </div>
                  <div className="emh-dp2-attr-row">
                    <div><span>Passing</span><span><b ref={setRef('attrPass')}>84</b> <i>↑5</i></span></div>
                    <div className="emh-dp2-attr-track"><div ref={setRef('barPass')} style={{ width: '56%' }} /></div>
                  </div>
                  <div className="emh-dp2-attr-row">
                    <div><span>Vision</span><span><b ref={setRef('attrVis')}>85</b> <i>↑3</i></span></div>
                    <div className="emh-dp2-attr-track"><div ref={setRef('barVis')} style={{ width: '58%' }} /></div>
                  </div>
                  <div className="emh-dp2-attr-row">
                    <div><span>Dribbling</span><span>86 <i>↑4</i></span></div>
                    <div className="emh-dp2-attr-track"><div ref={setRef('barDrib')} style={{ width: '60%' }} /></div>
                  </div>
                </div>

                <div ref={setRef('screen-recognition')} className="emh-dp2-screen emh-dp2-screen-recognition" style={{ opacity: 0 }} data-screen="recognition">
                  <div ref={setRef('confetti')} className="emh-dp2-confetti" aria-hidden="true" />
                  <div className="emh-dp2-rec-eyebrow">ACHIEVEMENT UNLOCKED</div>
                  <div ref={setRef('recBadge')} className="emh-dp2-rec-badge">
                    <svg viewBox="0 0 24 24" fill="#3a2a08"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
                  </div>
                  <div className="emh-dp2-rec-title">Player of<br />the Match</div>
                  <div className="emh-dp2-rec-verified">
                    <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                    COACH VERIFIED
                  </div>
                  <div className="emh-dp2-rec-meta">Curzon Ashton Juniors vs Denton FC · 18 May 2026</div>
                </div>

                <div ref={setRef('screen-collection')} className="emh-dp2-screen" style={{ opacity: 0 }} data-screen="collection">
                  <div className="emh-dp2-screen-label">COLLECTION</div>
                  <div className="emh-dp2-coll-hero">
                    <div className="emh-dp2-coll-season">FIRST SEASON</div>
                    <div className="emh-dp2-coll-year">2026</div>
                    <div className="emh-dp2-coll-row">
                      <div className="emh-dp2-coll-ring">
                        <svg viewBox="0 0 76 76">
                          <circle cx="38" cy="38" r="32" className="emh-dp2-coll-ring-track" />
                          <circle ref={setRef('collectionRing') as unknown as (el: SVGCircleElement | null) => void} cx="38" cy="38" r="32" className="emh-dp2-coll-ring-fill" style={{ strokeDashoffset: 56 }} />
                        </svg>
                        <span ref={setRef('collectionPct')}>72%</span>
                      </div>
                      <div className="emh-dp2-coll-count-wrap">
                        <div>CARDS COLLECTED</div>
                        <div><span ref={setRef('collectionCount')}>11</span> <small>/ 14</small></div>
                      </div>
                    </div>
                  </div>
                  <div className="emh-dp2-coll-grid">
                    <div className="emh-dp2-coll-tile"><img src={`${dpStageAssetPath}/jn-firstgoal.png`} alt="" /></div>
                    <div className="emh-dp2-coll-tile"><img src={`${dpStageAssetPath}/jn-teamphoto.png`} alt="" /></div>
                    <div className="emh-dp2-coll-tile"><img src={`${dpStageAssetPath}/jn-trophy.png`} alt="" /></div>
                    <div className="emh-dp2-coll-tile emh-dp2-coll-slot">
                      <svg ref={setRef('collectionLock') as unknown as (el: SVGSVGElement | null) => void} viewBox="0 0 24 24" className="emh-dp2-coll-lock"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                      <img ref={setRef('collectionNew') as unknown as (el: HTMLImageElement | null) => void} src={`${dpStageAssetPath}/jn-potm.png`} alt="" className="emh-dp2-coll-new" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosingStatement() {
  return (
    <div className="emh-dp2-closing">
      <p>Every card becomes a living season archive.</p>
    </div>
  );
}

function WhyItMatters() {
  return (
    <div className="emh-dp2-why">
      <p className="emh-dp2-label">Why it matters</p>
      <div>
        {dpWhyCards.map(([title, body], index) => (
          <article key={title}>
            <span><ProfileIcon index={index + 1} /></span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const everyoneCards = [
  { photo: '/assets/everyone/oc-parents.png', alt: 'Family sharing an Emblem card', label: 'PARENTS', body: 'Keep every football memory.', iconIndex: 5 },
  { photo: '/assets/everyone/oc-players.png', alt: 'Player and stats', label: 'PLAYERS', body: 'Watch yourself improve.', iconIndex: 2 },
  { photo: '/assets/everyone/oc-coaches.png', alt: 'Coach and player', label: 'COACHES', body: 'Celebrate moments forever.', iconIndex: 4 },
  { photo: '/assets/everyone/oc-clubs.png', alt: 'Club pitch and moments collected', label: 'CLUBS', body: 'Create a living history.', iconIndex: 0 },
] as const;

export function BuiltForEveryoneSection() {
  return (
    <div className="emh-everyone">
      <p className="emh-everyone-eyebrow">Built for everyone involved</p>
      <h2>One card. Everyone connected.</h2>
      <p className="emh-everyone-sub">Emblem brings every part of the football journey together.<br />One card. Endless value.</p>
      <div className="emh-everyone-grid">
        {everyoneCards.map((card) => (
          <article key={card.label}>
            <div className="emh-everyone-photo">
              <img src={card.photo} alt={card.alt} loading="lazy" decoding="async" />
            </div>
            <div className="emh-everyone-body">
              <span className="emh-everyone-icon"><ProfileIcon index={card.iconIndex} /></span>
              <h3>{card.label}</h3>
              <i />
              <p>{card.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="emh-faq-list">
      {faqItems.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <article className="emh-faq-item" key={item.question}>
            <button
              type="button"
              className="emh-faq-question"
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span>{item.question}</span>
              <svg className="emh-faq-chevron" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div id={`faq-answer-${index}`} className={`emh-faq-answer ${isOpen ? 'is-open' : ''}`}>
              <div>
                {item.lead && <p className="emh-faq-lead">{item.lead}</p>}
                {item.answer && <p>{item.answer}</p>}
                {item.chips && (
                  <div className="emh-faq-chip-list">
                    {item.chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

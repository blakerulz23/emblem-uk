'use client';

import Image from 'next/image';
import { MouseEvent, PointerEvent, RefObject, useCallback, useEffect, useRef, useState } from 'react';

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

type DP2MomentId = 'firstgoal' | 'teamphoto' | 'tournament' | 'captain';
type DP2TabId = 'journey' | 'matches' | 'photos' | 'highlights' | 'achievements' | 'teams';
type DP2Moment = {
  id: DP2MomentId;
  title: string;
  date: string;
  vs: string;
  trust: 'Official Club' | 'Coach Verified';
  official: boolean;
  about: string;
  media: string;
  mediaType: 'image' | 'video';
  stats: [label: string, value: string][];
};
type DP2Experience = {
  id: DP2TabId;
  label: string;
  momentId: DP2MomentId;
  iconIndex: number;
};

const dpAssetPath = '/assets/optimized';
const dpWordmarkPath = '/assets/digital-profile/emblem-wordmark.png';

const dpMoments: Record<DP2MomentId, DP2Moment> = {
  firstgoal: {
    id: 'firstgoal',
    title: 'First Goal',
    date: '12 March 2026',
    vs: 'vs Hyde United',
    trust: 'Coach Verified',
    official: false,
    about: 'Ollie scores his first goal from a corner. Great awareness and a composed finish. A proud moment for the whole family.',
    media: '/assets/dp-first-goal.mp4',
    mediaType: 'video',
    stats: [['Goal', '1'], ['Assists', '0'], ['Minutes Played', '60'], ['Result', 'Won 3-1']],
  },
  teamphoto: {
    id: 'teamphoto',
    title: 'Team Photo',
    date: '22 April 2026',
    vs: 'Curzon Ashton U10',
    trust: 'Coach Verified',
    official: false,
    about: 'The full U10 squad together on presentation day - the group that made the whole season one to remember.',
    media: `${dpAssetPath}/dp-team-photo.webp`,
    mediaType: 'image',
    stats: [['Photos', '24'], ['Squad', '14'], ['Season', '2025/26'], ['Occasion', 'Presentation']],
  },
  tournament: {
    id: 'tournament',
    title: 'Tournament Winner',
    date: '7 June 2026',
    vs: 'Summer Shield Final',
    trust: 'Official Club',
    official: true,
    about: 'Curzon Ashton lift the Summer Shield after a 3-1 final. Ollie kept a clean sheet in the semi to get them there.',
    media: `${dpAssetPath}/dp-tournament-winner.webp`,
    mediaType: 'image',
    stats: [['Result', 'Won 3-1'], ['Clean Sheets', '2'], ['Round', 'Final'], ['Trophy', 'Winners']],
  },
  captain: {
    id: 'captain',
    title: 'Captain',
    date: '15 September 2027',
    vs: 'Season 2027/28',
    trust: 'Official Club',
    official: true,
    about: 'Named club captain for the new season - recognised by the coaches for leadership on and off the pitch.',
    media: `${dpAssetPath}/dp-captain.webp`,
    mediaType: 'image',
    stats: [['Appointed', '2027/28'], ['Role', 'Captain'], ['Age Group', 'U11'], ['Club', 'Curzon Ashton']],
  },
};

const dpExperiences: DP2Experience[] = [
  { id: 'journey', label: 'Journey', momentId: 'firstgoal', iconIndex: 0 },
  { id: 'matches', label: 'Matches', momentId: 'tournament', iconIndex: 1 },
  { id: 'photos', label: 'Photos', momentId: 'teamphoto', iconIndex: 2 },
  { id: 'highlights', label: 'Highlights', momentId: 'firstgoal', iconIndex: 3 },
  { id: 'achievements', label: 'Achievements', momentId: 'tournament', iconIndex: 4 },
  { id: 'teams', label: 'Teams', momentId: 'captain', iconIndex: 5 },
];

const dpTimeline: { year: string; moments: DP2MomentId[] }[] = [
  { year: '2026', moments: ['firstgoal', 'teamphoto', 'tournament'] },
  { year: '2027', moments: ['captain'] },
];

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
          <Image src={`${dpAssetPath}/card-print-new.webp`} alt="" width={260} height={360} loading="lazy" sizes="(max-width: 760px) 42vw, 260px" />
        )}
        {step.number === '3' && (
          <>
            <Image src={`${dpAssetPath}/card-hero-slab.webp`} alt="" width={220} height={330} loading="lazy" sizes="(max-width: 760px) 38vw, 220px" />
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
  const [activeTab, setActiveTab] = useState<DP2TabId>('journey');
  const [activeMomentId, setActiveMomentId] = useState<DP2MomentId>('firstgoal');
  const [swapping, setSwapping] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const revealRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    if (unlocked && dpMoments[activeMomentId].mediaType === 'video') {
      videoRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
    }
  }, [unlocked, activeMomentId]);

  const unlock = (scroll = false) => {
    if (unlocked || booting) {
      return;
    }
    if (reducedMotion) {
      setUnlocked(true);
      if (scroll) window.setTimeout(() => revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return;
    }
    setBooting(true);
    window.setTimeout(() => {
      setBooting(false);
      setUnlocked(true);
      if (scroll) window.setTimeout(() => revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }, 900);
  };

  const toggleCollection = () => {
    if (!unlocked) {
      unlock(true);
      return;
    }
    setUnlocked(false);
  };

  const pickMoment = (momentId: DP2MomentId) => {
    if (momentId === activeMomentId) return;
    setSwapping(true);
    window.setTimeout(() => {
      setActiveMomentId(momentId);
      setSwapping(false);
    }, reducedMotion ? 0 : 160);
  };

  const pickTab = (tab: DP2Experience) => {
    setActiveTab(tab.id);
    pickMoment(tab.momentId);
  };

  return (
    <div className="emh-dp2">
      <div className="emh-dp2-intro">
        <div className="emh-dp2-copy">
          <p className="emh-dp2-eyebrow">The digital profile</p>
          <h2>The card is just the <span>beginning.</span></h2>
          <p>Every card unlocks a private digital collection that grows with every match, goal, photo and milestone.</p>
          <button type="button" className={`emh-dp2-toggle ${unlocked ? 'is-open' : ''}`} onClick={toggleCollection}>
            <NfcIcon />
            <span>{unlocked ? 'Hide the collection' : 'See everything the card unlocks'}</span>
            <ChevronIcon />
          </button>
          <div className="emh-dp2-private">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
            </svg>
            Private. Secure. Always theirs.
          </div>
        </div>
        <CardPhoneReveal booting={booting} hinting={hinting} unlocked={unlocked} onUnlock={() => unlock(true)} />
      </div>

      <div
        ref={revealRef}
        id="dpReveal"
        className={`emh-dp2-reveal ${unlocked ? 'is-open' : ''}`}
        aria-hidden={!unlocked}
      >
        {unlocked && (
          <CollectionPanel
            activeMoment={dpMoments[activeMomentId]}
            activeMomentId={activeMomentId}
            activeTab={activeTab}
            onPickMoment={pickMoment}
            onPickTab={pickTab}
            swapping={swapping}
            videoRef={videoRef}
          />
        )}
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

function CollectionPanel({
  activeMoment,
  activeMomentId,
  activeTab,
  onPickMoment,
  onPickTab,
  swapping,
  videoRef,
}: {
  activeMoment: DP2Moment;
  activeMomentId: DP2MomentId;
  activeTab: DP2TabId;
  onPickMoment: (momentId: DP2MomentId) => void;
  onPickTab: (tab: DP2Experience) => void;
  swapping: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}) {
  return (
    <>
      <ExperienceTabs activeTab={activeTab} onPickTab={onPickTab} />
      <div className="emh-dp2-panel">
        <MomentTimeline activeMomentId={activeMomentId} onPickMoment={onPickMoment} />
        <MomentDetail activeMoment={activeMoment} swapping={swapping} videoRef={videoRef} />
      </div>
    </>
  );
}

function ExperienceTabs({
  activeTab,
  onPickTab,
}: {
  activeTab: DP2TabId;
  onPickTab: (tab: DP2Experience) => void;
}) {
  return (
    <div className="emh-dp2-tabs" role="tablist" aria-label="Digital profile experiences">
      {dpExperiences.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'is-active' : ''}
          onClick={() => onPickTab(tab)}
        >
          <ProfileIcon index={tab.iconIndex} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function MomentTimeline({
  activeMomentId,
  onPickMoment,
}: {
  activeMomentId: DP2MomentId;
  onPickMoment: (momentId: DP2MomentId) => void;
}) {
  return (
    <div className="emh-dp2-timeline">
      <p className="emh-dp2-label">Journey timeline</p>
      {dpTimeline.map((group) => (
        <div key={group.year} className="emh-dp2-year">
          <h3>{group.year}</h3>
          <div>
            {group.moments.map((momentId) => {
              const moment = dpMoments[momentId];
              return (
                <button
                  key={moment.id}
                  type="button"
                  className={activeMomentId === moment.id ? 'is-active' : ''}
                  onClick={() => onPickMoment(moment.id)}
                >
                  <span><ProfileIcon index={moment.official ? 4 : 2} /></span>
                  <strong>{moment.title}</strong>
                  <small>{moment.date}</small>
                  <em className={moment.official ? 'is-official' : ''}>{moment.trust}</em>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MomentDetail({
  activeMoment,
  swapping,
  videoRef,
}: {
  activeMoment: DP2Moment;
  swapping: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}) {
  return (
    <>
      <div className={`emh-dp2-media ${swapping ? 'is-swapping' : ''}`}>
        <div className="emh-dp2-frame">
          {activeMoment.mediaType === 'video' ? (
            <video
              key={activeMoment.id}
              ref={videoRef}
              src={activeMoment.media}
              muted
              playsInline
              loop
              preload="none"
            />
          ) : (
            <Image key={activeMoment.id} src={activeMoment.media} alt={activeMoment.title} width={1200} height={675} loading="lazy" sizes="(max-width: 900px) 92vw, 44vw" />
          )}
          <span className="emh-dp2-media-badge">
            <i className={activeMoment.official ? 'is-official' : ''} />
            {activeMoment.trust}
          </span>
          {activeMoment.mediaType === 'video' && (
            <div className="emh-dp2-scrubber">
              <span />
              <b>0:08 / 0:08</b>
            </div>
          )}
        </div>
        <h3>{activeMoment.title}</h3>
        <div className="emh-dp2-meta">
          <span>{activeMoment.date}</span>
          <span>{activeMoment.vs}</span>
          <span className={activeMoment.official ? 'is-official' : ''}>{activeMoment.trust}</span>
        </div>
      </div>
      <div className={`emh-dp2-about ${swapping ? 'is-swapping' : ''}`}>
        <p className="emh-dp2-label">About this moment</p>
        <p>{activeMoment.about}</p>
        <p className="emh-dp2-label">Key stats</p>
        <div className="emh-dp2-stats">
          {activeMoment.stats.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <button type="button">Share Moment</button>
      </div>
    </>
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

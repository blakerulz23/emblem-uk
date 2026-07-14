'use client';

import { MouseEvent, useEffect, useRef, useState } from 'react';

type Moment = {
  title: string;
  body: string;
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
            const spread = isCompact ? (hovered ? 40 : 34) : (hovered ? 92 : 76);
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
    image: momentArt[index % momentArt.length],
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
    isTimeline: index === 2,
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
            className={`emh-moment-card ${moment.isTimeline ? 'emh-moment-card-timeline' : ''}`}
            type="button"
            aria-pressed={active === index}
            onClick={() => {
              setActive(index);
              setOpenIndex(index);
            }}
          >
            {!moment.isTimeline && <img src={moment.image} alt="" loading="lazy" decoding="async" />}
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{moment.title}</h3>
            <p>{moment.body}</p>
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

'use client';

import { MouseEvent, useEffect, useRef, useState } from 'react';

type Moment = {
  title: string;
  body: string;
};

type ProfileItem = [string, string];
type ProfileFeature = [string, string];

const fanCards = [
  { name: 'Sapphire', src: '/assets/card-fan-2.png' },
  { name: 'Emerald', src: '/assets/card-fan-4.png' },
  { name: 'Floodlight', src: '/assets/card-fan-1.png' },
  { name: 'Cosmic', src: '/assets/card-fan-3.png' },
  { name: 'Orange', src: '/assets/card-fan-5.png' },
];

const nfcScreens = [
  '/assets/os-mini-home.png',
  '/assets/os-mini-card.png',
  '/assets/os-mini-journey.png',
];

const momentArt = ['/assets/moment-1.png', '/assets/moment-2.png', '/assets/moment-3.png', '/assets/moment-4.png'];

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
                <img src={card.src} alt={`${card.name} Emblem card`} />
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
  const railRef = useRef<HTMLDivElement | null>(null);

  function scrollRail(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * 360, behavior: 'smooth' });
  }

  return (
    <div className="emh-moment-rail-shell">
      <div className="emh-rail-controls">
        <button type="button" aria-label="Previous moment" onClick={() => scrollRail(-1)}>{'<'}</button>
        <button type="button" aria-label="Next moment" onClick={() => scrollRail(1)}>{'>'}</button>
      </div>

      <div ref={railRef} className="emh-moment-rail">
        {moments.map((moment, index) => (
          <button
            key={moment.title}
            className="emh-moment-card"
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            <img src={momentArt[index % momentArt.length]} alt="" />
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{moment.title}</h3>
            <p>{moment.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DigitalProfilePreview({
  items,
  features,
}: {
  items: ProfileItem[];
  features: ProfileFeature[];
}) {
  return (
    <div className="emh-profile-explorer">
      <div className="emh-profile-title-row">
        <span aria-hidden="true" />
        <h2>Explore their digital collection</h2>
        <span aria-hidden="true" />
      </div>

      <div className="emh-profile-item-grid">
        {items.map(([title, body], index) => (
          <article key={title}>
            <span>
              <ProfileIcon index={index} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="emh-profile-showcase">
        <div className="emh-profile-feature-list">
          {features.map(([title, body], index) => (
            <article key={title} className={index === 0 ? 'active' : ''}>
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

        <div className="emh-profile-phone-stage">
          <div className="emh-profile-phone-frame">
            <img src="/assets/eos-home.png" alt="Emblem digital profile on a phone" />
          </div>
        </div>
      </div>
    </div>
  );
}

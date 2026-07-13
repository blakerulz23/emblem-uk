'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Moment = {
  title: string;
  body: string;
};

type ProfileItem = [string, string];
type ProfileFeature = [string, string];

const heroCards = [
  { name: 'Floodlight', src: '/assets/card-hero-slab.png', swatch: 'linear-gradient(145deg,#e97435,#0e6f7a)' },
  { name: 'Royal', src: '/hollinwood-card-03.png', swatch: 'linear-gradient(145deg,#1748c7,#07163f)' },
  { name: 'Crimson', src: '/hollinwood-card-07.png', swatch: 'linear-gradient(145deg,#e73b36,#3b0505)' },
  { name: 'Gold', src: '/hollinwood-card-09.png', swatch: 'linear-gradient(145deg,#e4b243,#372300)' },
  { name: 'Emerald', src: '/hollinwood-card-05.png', swatch: 'linear-gradient(145deg,#1c9b58,#041c10)' },
];

export function HeroCardShowcase() {
  const [active, setActive] = useState(0);
  const [tilt, setTilt] = useState({ x: 7, y: -3, scale: 1 });
  const [scrollLift, setScrollLift] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const progress = Math.max(0, Math.min(1, (vh * 0.78 - rect.top) / (vh * 0.5)));
      setScrollLift(progress);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const card = heroCards[active];
  const rotateX = tilt.x - scrollLift * 7;
  const translateY = -scrollLift * 12;

  return (
    <div className="emh-scroll-card-stage" aria-label="Emblem player card preview">
      <div
        ref={wrapRef}
        className="emh-scroll-card-perspective"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          setTilt({ x: 4 - py * 13, y: px * 16, scale: 1.035 });
        }}
        onMouseLeave={() => setTilt({ x: 7, y: -3, scale: 1 })}
      >
        <div className="emh-scroll-card-shadow" aria-hidden="true" />
        <div
          className="emh-scroll-card"
          style={{
            transform: `translateY(${translateY}px) rotateX(${rotateX}deg) rotateY(${tilt.y}deg) scale(${tilt.scale})`,
          }}
        >
          <img className="emh-hero-slab" src={card.src} alt={`${card.name} Emblem football trading card`} />
          <div className="emh-scroll-card-glare" aria-hidden="true" />
        </div>
      </div>

      <div className="emh-hero-swatches" aria-label="Choose card edition">
        <span className="emh-edition-label">Edition</span>
        {heroCards.map((item, index) => (
          <button
            key={item.name}
            className="emh-edition-swatch"
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            style={{
              ['--swatch-preview' as string]: item.swatch,
              ['--swatch-ring' as string]: active === index ? '#e97435' : 'rgba(20,17,15,.14)',
              ['--swatch-glow' as string]: active === index ? '0 0 14px rgba(233,116,53,.65)' : 'none',
            }}
          >
            <i />
            <b>{item.name}</b>
          </button>
        ))}
      </div>

      <p className="emh-hero-edition-note">
        <span />
        {card.name} edition · tap a colour or hover the card
      </p>
    </div>
  );
}

export function MomentsExplorer({ moments }: { moments: Moment[] }) {
  const [active, setActive] = useState(0);
  const activeMoment = moments[active];

  return (
    <>
      <div className="emh-moments-grid emh-moments-grid-interactive">
        {moments.map((moment, index) => (
          <button
            key={moment.title}
            className="emh-moment-button"
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{moment.title}</h3>
            <p>{moment.body}</p>
            <em>Tap to expand</em>
          </button>
        ))}
      </div>

      <article className="emh-moment-expanded">
        <span>{String(active + 1).padStart(2, '0')}</span>
        <h3>{activeMoment.title}</h3>
        <p>{activeMoment.body}</p>
      </article>
    </>
  );
}

export function DigitalProfilePreview({
  items,
  features,
}: {
  items: ProfileItem[];
  features: ProfileFeature[];
}) {
  const [active, setActive] = useState(0);
  const feature = features[active % features.length];

  const phoneLabel = useMemo(() => {
    const [title, body] = items[active];
    return { title, body };
  }, [active, items]);

  return (
    <div className="emh-profile-explorer">
      <p>Explore their digital collection</p>
      <div className="emh-profile-tabs" role="tablist" aria-label="Digital profile sections">
        {items.map(([title, body], index) => (
          <button
            key={title}
            className="emh-profile-tab"
            type="button"
            role="tab"
            aria-selected={active === index}
            onClick={() => setActive(index)}
          >
            <h3>{title}</h3>
            <p>{body}</p>
          </button>
        ))}
      </div>

      <div className="emh-profile-live-panel">
        <div>
          <span>{phoneLabel.title}</span>
          <h3>{feature[0]}</h3>
          <p>{feature[1]}</p>
        </div>
        <strong>{phoneLabel.body}</strong>
      </div>

      <div className="emh-profile-feature-grid">
        {features.map(([title, body], index) => (
          <button
            key={title}
            className="emh-profile-feature"
            type="button"
            aria-pressed={active % features.length === index}
            onClick={() => setActive(index)}
          >
            <h3>{title}</h3>
            <p>{body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

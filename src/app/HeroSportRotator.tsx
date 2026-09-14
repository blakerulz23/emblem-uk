'use client';

/**
 * Rotating multi-sport hero: cycles hockey (Frost Chrome), basketball
 * (Neon Court via CardCanvas) and soccer (Neon Pitch via CardCanvas)
 * in the homepage hero slot, replacing the static product-composition
 * image. Crossfades every 6s; pauses while hovered; dots are clickable.
 * All three cards are synthetic sample players — no real child data.
 */

import { useEffect, useState } from 'react';
import CardCanvas from '@/components/builder/CardCanvas';
import FrostChromeHockeyCard from '@/components/emblem-uk/hockey/FrostChromeHockeyCard';
import { CardData } from '@/lib/types';
import { TEMPLATES } from '@/lib/templates';

const baseCard: Omit<CardData, 'sport' | 'template'> = {
  playerName: '', teamName: '', jerseyNumber: '', position: '',
  accentColor: '#DC2626', secondaryColor: '#1E3A5F',
  playerPhoto: '/samples/player-jaylen.png', teamLogo: '/samples/elite-hoops-logo.png',
  photoOffsetX: 0, photoOffsetY: 0, photoScale: 1,
  showStats: true, stats: {}, backText: '', backPhoto: null,
  backPhotoOffsetX: 0, backPhotoOffsetY: 0, backPhotoScale: 1,
  height: `5'10"`, age: '16', classYear: '2027', hometown: '',
};

const basketballCard: CardData = {
  ...baseCard,
  sport: 'basketball',
  template: TEMPLATES.find(t => t.id === 'basketball-futuristic') ?? null,
  playerName: 'Jaylen Ross', teamName: 'Thunder', jerseyNumber: '23',
  position: 'Point Guard', hometown: 'Atlanta, GA',
  stats: { ppg: '28.5', rpg: '6.2', apg: '8.1', spg: '2.3', bpg: '0.5', ftpct: '89' },
};

const soccerCard: CardData = {
  ...baseCard,
  sport: 'soccer',
  template: TEMPLATES.find(t => t.id === 'soccer-futuristic') ?? null,
  playerName: 'Leo Barnes', teamName: 'Ashton Juniors', jerseyNumber: '7',
  position: 'Winger', accentColor: '#F1601D', secondaryColor: '#143C2B',
  playerPhoto: '/seed-leo.png', teamLogo: null,
  stats: { goals: '12', assists: '9', apps: '21' },
};

const SLIDES = [
  { id: 'hockey', label: 'Hockey' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'soccer', label: 'Football' },
] as const;

const ROTATE_MS = 6000;

export default function HeroSportRotator() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive(a => (a + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div
      className="emh-hero-rotator"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Emblem cards across sports"
    >
      <div className="emh-hero-rotator-stage">
        {SLIDES.map((slide, i) => (
          <div
            key={slide.id}
            className={`emh-hero-rotator-slide${i === active ? ' is-active' : ''}`}
            aria-hidden={i !== active}
          >
            {slide.id === 'hockey' && (
              <FrostChromeHockeyCard size={290} name="Avery Stone" number="27" team="North Ice" position="C" />
            )}
            {slide.id === 'basketball' && <CardCanvas card={basketballCard} side="front" width={270} />}
            {slide.id === 'soccer' && <CardCanvas card={soccerCard} side="front" width={270} />}
          </div>
        ))}
      </div>
      <div className="emh-hero-rotator-dots" role="tablist" aria-label="Choose a sport">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`emh-hero-rotator-dot${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          >
            {slide.label}
          </button>
        ))}
      </div>
    </div>
  );
}

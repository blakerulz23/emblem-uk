'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Homepage hero: the physical card and the profile it opens, side by side.
 *
 * Card presentation pattern from ca.emblem.cards (designs rotate inside the
 * hero), rebuilt light: Canada renders every card live from full print
 * templates (~30 MB); here each design is one pre-rendered WebP (40–80 KB)
 * and the phone is plain HTML/CSS, so nothing heavy ships.
 *
 * - Only the first design is in the server HTML. The others mount after the
 *   page has loaded, so they never compete with first paint.
 * - The card rotates; the phone and NFC link stay put, and the phone's accent
 *   follows the card so the connection reads at a glance.
 * - Rotation pauses on hover, when the tab is hidden or the hero is off
 *   screen, and has a visible pause button. With reduced motion it never
 *   auto-rotates; the design buttons still switch cards.
 *
 * The player is synthetic: AI-generated from a text prompt only (no photo of
 * a real child), with an invented name, and every kit marking (sponsor,
 * phone number, crest, maker's logo, number) removed.
 */
const DESIGNS = [
  { id: 'royal', name: 'Royal Edition', accent: '#9d84ff' },
  { id: 'crimson', name: 'Crimson', accent: '#ff5a66' },
  { id: 'emerald', name: 'Emerald Edition', accent: '#34d892' },
  { id: 'glacier', name: 'Glacier Edition', accent: '#62cdff' },
] as const;

const ROTATE_MS = 4500;
const PLAYER = { name: 'Riley Hart', role: 'Striker', club: 'Westbrook Juniors U12', initials: 'RH' };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function HeroStage() {
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Mount the other designs only once the page has finished loading.
  useEffect(() => {
    const arm = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (idle) idle(() => setArmed(true));
      else window.setTimeout(() => setArmed(true), 200);
    };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
    return () => window.removeEventListener('load', arm);
  }, []);

  useEffect(() => {
    const update = () => setTabHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const rotating = armed && !reducedMotion && !userPaused && !interacting && onScreen && !tabHidden;
  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % DESIGNS.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotating]);

  const design = DESIGNS[active];
  const chooseDesign = (i: number) => {
    setActive(i);
    setUserPaused(true);
  };

  return (
    <div id="cards" className="emh-stage-wrap" style={{ '--stage-accent': design.accent } as CSSProperties}>
      <div
        ref={stageRef}
        className="emh-stage"
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
      >
        <div className="emh-stage-card">
          {DESIGNS.map((d, i) => {
            if (i > 0 && !armed) return null;
            const isActive = i === active;
            return (
              <img
                key={d.id}
                className={isActive ? 'is-active' : undefined}
                src={`/assets/home/hero/card-${d.id}-400.webp`}
                srcSet={`/assets/home/hero/card-${d.id}-400.webp 400w, /assets/home/hero/card-${d.id}-560.webp 560w`}
                sizes="(max-width: 760px) 44vw, 270px"
                width={400}
                height={560}
                alt={isActive ? `${d.name} personalised football card for a sample player, ${PLAYER.name}, number 9` : ''}
                aria-hidden={isActive ? undefined : true}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'low'}
                decoding="async"
              />
            );
          })}
        </div>

        <svg className="emh-stage-nfc" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
          <path d="M14 18a17 17 0 0 1 0 24" />
          <path d="M24 10a29 29 0 0 1 0 40" />
          <path d="M34 2a41 41 0 0 1 0 56" />
        </svg>

        <div
          className="emh-stage-phone"
          role="img"
          aria-label={`The card opens ${PLAYER.name}'s private player profile on a phone: 24 appearances, 11 goals, 6 assists and a Player of the Match award.`}
        >
          <div className="emh-phone-screen" aria-hidden="true">
            <div className="emh-phone-notch" />
            <p className="emh-phone-kicker">Player profile</p>
            <div className="emh-phone-id">
              <span className="emh-phone-avatar">{PLAYER.initials}</span>
              <span>
                <b>{PLAYER.name}</b>
                <small>{PLAYER.role} · {PLAYER.club}</small>
              </span>
            </div>
            <div className="emh-phone-stats">
              <span><b>24</b><small>Apps</small></span>
              <span><b>11</b><small>Goals</small></span>
              <span><b>6</b><small>Assists</small></span>
            </div>
            <div className="emh-phone-moment">
              <small>Latest</small>
              <b>Player of the Match</b>
              <small>From the coach · Saturday</small>
            </div>
            <div className="emh-phone-tap">
              <i />
              Opened with a tap
            </div>
          </div>
        </div>
      </div>

      <div className="emh-stage-controls">
        <div className="emh-stage-designs" role="group" aria-label="Card designs">
          {DESIGNS.map((d, i) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={i === active}
              onClick={() => chooseDesign(i)}
              data-track={`hero_design_${d.id}`}
              style={{ '--chip-accent': d.accent } as CSSProperties}
            >
              <i aria-hidden="true" />
              {d.name}
            </button>
          ))}
        </div>
        {!reducedMotion && (
          <button
            type="button"
            className="emh-stage-pause"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? 'Play card designs' : 'Pause card designs'}
          >
            <span aria-hidden="true">{userPaused ? '▶' : '❚❚'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

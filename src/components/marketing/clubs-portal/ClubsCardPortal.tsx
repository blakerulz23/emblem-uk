'use client';

import { Component, useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { CardPortalSceneProps } from './CardPortalScene';
import SampleSeason, { SAMPLE_PLAYER } from './SampleSeason';
import { canUseWebGL } from './portal-math';

/**
 * Clubs page hero: one Emblem card a coach can "go through" to see a sample
 * player's season. Marketing presentation only: the customer receives the
 * printed card and a private profile, never a 3D world.
 *
 * Loading: the server HTML is a static card image plus a button. three.js
 * and the scene load only after an explicit tap/click/Enter, so nothing
 * here delays the headline, pricing or "Start a Squad Invite".
 *
 * Phones: the canvas never takes pointer events (no drag, orbit or scroll
 * capture); entering and leaving are buttons; the page scrolls normally.
 *
 * Fallbacks: reduced motion, no WebGL, a scene error or a slow load all
 * show the same season as plain HTML with no 3D.
 */
const CARD_IMAGE = '/assets/home/hero/card-royal-560.webp';
const ACCENT = '#9d84ff';
const LOAD_TIMEOUT_MS = 10_000;
const TRANSITION_GIVE_UP_MS = 4_000;

type Mode = 'card' | 'loading' | 'entering' | 'inside' | 'exiting';

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

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ClubsCardPortal({ startHref }: { startHref: string }) {
  const [mode, setMode] = useState<Mode>('card');
  const [fallback, setFallback] = useState(false);
  const [Scene, setScene] = useState<ComponentType<CardPortalSceneProps> | null>(null);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const loadTimeout = useRef<number | null>(null);
  const headingId = useId();

  const showSeason = mode === 'inside';
  const sceneActive = Scene !== null && !fallback && mode !== 'card';

  const showHtmlOnly = useCallback(() => {
    if (loadTimeout.current) window.clearTimeout(loadTimeout.current);
    loadTimeout.current = null;
    setFallback(true);
    setScene(null);
    setMode('inside');
  }, []);

  const enter = useCallback(async () => {
    if (mode !== 'card') return;
    if (reducedMotion || !canUseWebGL()) {
      showHtmlOnly();
      return;
    }
    setFallback(false);
    setMode('loading');
    // The scene calls onReady once it has drawn; that clears this timeout.
    loadTimeout.current = window.setTimeout(showHtmlOnly, LOAD_TIMEOUT_MS);
    try {
      const mod = await import('./CardPortalScene');
      setScene(() => mod.default);
    } catch {
      if (loadTimeout.current) window.clearTimeout(loadTimeout.current);
      showHtmlOnly();
    }
  }, [mode, reducedMotion, showHtmlOnly]);

  const back = useCallback(() => {
    restoreFocus.current = true;
    if (fallback || !Scene) {
      setFallback(false);
      setMode('card');
      return;
    }
    setMode('exiting');
  }, [fallback, Scene]);

  const onReady = useCallback(() => {
    if (loadTimeout.current) window.clearTimeout(loadTimeout.current);
    loadTimeout.current = null;
    setMode((m) => (m === 'loading' ? 'entering' : m));
  }, []);
  const onEntered = useCallback(() => setMode((m) => (m === 'entering' ? 'inside' : m)), []);
  const onExited = useCallback(() => {
    setMode('card');
    setScene(null); // unmount the canvas and release its GPU resources
  }, []);

  // Focus: the season heading on arrival, the explore button on return. If
  // that element is off screen (e.g. under the sticky header on a phone),
  // bring it into view once; this only follows the visitor's own action.
  useEffect(() => {
    const reveal = (el: HTMLElement | null) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    };
    if (mode === 'inside') reveal(headingRef.current);
    if (mode === 'card' && restoreFocus.current) {
      restoreFocus.current = false;
      reveal(enterRef.current);
    }
  }, [mode, reducedMotion]);

  // Escape leaves from anywhere in the experience.
  useEffect(() => {
    if (mode === 'card') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, back]);

  // Stop rendering while the stage is off screen or the tab is hidden.
  useEffect(() => {
    if (!sceneActive) return;
    const el = stageRef.current;
    let visible = true;
    let onScreen = true;
    const update = () => setPaused(!visible || !onScreen);
    const onVis = () => { visible = document.visibilityState === 'visible'; update(); };
    document.addEventListener('visibilitychange', onVis);
    const io = el && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); })
      : null;
    if (io && el) io.observe(el);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
      setPaused(false);
    };
  }, [sceneActive]);

  // Never leave a visitor waiting on a struggling GPU: if a transition hasn't
  // finished well after its 1.4 s, jump to the end state (the season shows,
  // or the card returns) and let the 3D catch up behind it.
  useEffect(() => {
    if (mode !== 'entering' && mode !== 'exiting') return;
    const id = window.setTimeout(() => {
      if (mode === 'entering') setMode((m) => (m === 'entering' ? 'inside' : m));
      else onExited();
    }, TRANSITION_GIVE_UP_MS);
    return () => window.clearTimeout(id);
  }, [mode, onExited]);

  // Rendering pauses off screen, so a transition that is still running when
  // the stage scrolls away is finished at once rather than left hanging.
  useEffect(() => {
    if (!paused) return;
    if (mode === 'exiting') onExited();
    if (mode === 'entering') setMode('inside');
  }, [paused, mode, onExited]);

  const SceneComponent = Scene;

  return (
    <div className="emh-portal" data-mode={mode} data-fallback={fallback ? 'true' : undefined}>
      <div ref={stageRef} className="emh-portal-stage">
        {SceneComponent && !fallback && (
          <SceneBoundary onError={showHtmlOnly}>
            <SceneComponent
              inside={mode === 'entering' || mode === 'inside' || mode === 'loading'}
              paused={paused}
              cardImage={CARD_IMAGE}
              accent={ACCENT}
              onReady={onReady}
              onEntered={onEntered}
              onExited={onExited}
              onError={showHtmlOnly}
            />
          </SceneBoundary>
        )}

        {/* The static card: what the server sends, and what stays until the 3D scene has drawn. */}
        <div className="emh-portal-card" aria-hidden={mode !== 'card' && mode !== 'loading' ? true : undefined}>
          <img
            src="/assets/home/hero/card-royal-400.webp"
            srcSet="/assets/home/hero/card-royal-400.webp 400w, /assets/home/hero/card-royal-560.webp 560w"
            sizes="(max-width: 760px) 62vw, 300px"
            width={400}
            height={560}
            alt={`Royal Edition personalised football card for a sample player, ${SAMPLE_PLAYER.name}, number ${SAMPLE_PLAYER.number}`}
            fetchPriority="high"
            decoding="async"
          />
        </div>

        {showSeason && (
          <section className="emh-portal-panel" aria-labelledby={headingId}>
            <SampleSeason ref={headingRef} headingId={headingId} startHref={startHref} onBack={back} />
          </section>
        )}

        {mode === 'loading' && (
          <p className="emh-portal-status" role="status">Opening the sample season…</p>
        )}
        {mode === 'entering' && (
          <button type="button" className="emh-portal-skip" onClick={() => setMode('inside')}>
            Skip animation
          </button>
        )}
      </div>

      {mode === 'card' && (
        <div className="emh-portal-cta">
          <p className="emh-portal-badge">Sample experience</p>
          <button ref={enterRef} type="button" className="emh-portal-enter" onClick={enter} data-track="clubs_portal_enter">
            <span className="emh-portal-enter-icon" aria-hidden="true" />
            Explore a sample season <span aria-hidden="true">→</span>
          </button>
          <p className="emh-portal-caption">
            <svg className="emh-portal-caption-icon" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
              <path d="M14 18a17 17 0 0 1 0 24" />
              <path d="M24 10a29 29 0 0 1 0 40" />
              <path d="M34 2a41 41 0 0 1 0 56" />
            </svg>
            The real card opens the player&rsquo;s private profile with a phone tap.
          </p>
        </div>
      )}
    </div>
  );
}

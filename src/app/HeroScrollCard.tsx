'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';

export type HeroCardOption = {
  key: string;
  label: string;
  image: string;
  preview: string;
  ring: string;
  glow: string;
};

type HeroScrollCardProps = {
  cards: HeroCardOption[];
};

export default function HeroScrollCard({ cards }: HeroScrollCardProps) {
  const [activeKey, setActiveKey] = useState(cards[0]?.key ?? '');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const scrollRotateRef = useRef(26);
  const scrollScaleRef = useRef(0.86);
  const hoverRotateXRef = useRef(0);
  const hoverRotateYRef = useRef(0);
  const hoverScaleRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const activeCard = useMemo(
    () => cards.find((card) => card.key === activeKey) ?? cards[0],
    [activeKey, cards],
  );

  useEffect(() => {
    const card = cardRef.current;
    const stage = stageRef.current;
    if (!card || !stage) return;

    const applyTransform = () => {
      const rotateX = scrollRotateRef.current + hoverRotateXRef.current;
      const rotateY = hoverRotateYRef.current;
      const scale = hoverScaleRef.current ?? scrollScaleRef.current;
      card.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    };

    const measure = () => {
      frameRef.current = null;
      const rect = stage.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 800;
      const centre = rect.top + rect.height / 2;
      let progress = (0.88 - centre / viewportHeight) / (0.88 - 0.42);
      progress = Math.max(0, Math.min(1, progress));
      scrollRotateRef.current = 26 * (1 - progress);
      scrollScaleRef.current = 0.86 + 0.14 * progress;
      applyTransform();
    };

    const requestMeasure = () => {
      if (frameRef.current == null) {
        frameRef.current = window.requestAnimationFrame(measure);
      }
    };

    measure();
    window.addEventListener('scroll', requestMeasure, { passive: true });
    window.addEventListener('resize', requestMeasure);

    return () => {
      window.removeEventListener('scroll', requestMeasure);
      window.removeEventListener('resize', requestMeasure);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const applyPointerTransform = (event: PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    const glare = glareRef.current;
    if (!card) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    hoverRotateYRef.current = (px - 0.5) * 22;
    hoverRotateXRef.current = -(py - 0.5) * 22;
    hoverScaleRef.current = 1.05;
    card.style.transition = 'transform 80ms linear';
    card.style.transform = `rotateX(${(scrollRotateRef.current + hoverRotateXRef.current).toFixed(2)}deg) rotateY(${hoverRotateYRef.current.toFixed(2)}deg) scale(1.050)`;

    if (glare) {
      glare.style.opacity = '0.86';
      glare.style.background = `radial-gradient(circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255,255,255,.58), rgba(255,255,255,0) 44%)`;
    }
  };

  const resetPointerTransform = () => {
    const card = cardRef.current;
    const glare = glareRef.current;
    hoverRotateXRef.current = 0;
    hoverRotateYRef.current = 0;
    hoverScaleRef.current = null;

    if (card) {
      card.style.transition = 'transform 500ms cubic-bezier(.22,.61,.36,1)';
      card.style.transform = `rotateX(${scrollRotateRef.current.toFixed(2)}deg) rotateY(0deg) scale(${scrollScaleRef.current.toFixed(3)})`;
    }

    if (glare) glare.style.opacity = '0';
  };

  if (!activeCard) return null;

  const style = {
    '--hero-card-ring': activeCard.ring,
    '--hero-card-glow': activeCard.glow,
  } as CSSProperties;

  return (
    <div className="emh-scroll-card-stage" ref={stageRef} style={style} aria-label="Example Emblem player card">
      <div className="emh-card-orbit emh-card-orbit-one" aria-hidden="true" />
      <div className="emh-card-orbit emh-card-orbit-two" aria-hidden="true" />

      <div
        className="emh-scroll-card-perspective"
        onPointerMove={applyPointerTransform}
        onPointerLeave={resetPointerTransform}
      >
        <div className="emh-scroll-card-shadow" aria-hidden="true" />
        <div className="emh-scroll-card" ref={cardRef}>
          <img src={activeCard.image} alt={`${activeCard.label} Emblem player card preview`} />
          <div className="emh-scroll-card-glare" ref={glareRef} aria-hidden="true" />
        </div>
      </div>

      <div className="emh-hero-swatches" aria-label="Available card styles">
        <span className="emh-edition-label">Edition</span>
        {cards.map((card) => (
          <button
            key={card.key}
            className="emh-edition-swatch"
            type="button"
            aria-label={`Show ${card.label} edition`}
            aria-pressed={card.key === activeCard.key}
            onClick={() => setActiveKey(card.key)}
            style={{
              '--swatch-preview': card.preview,
              '--swatch-ring': card.ring,
              '--swatch-glow': card.glow,
            } as CSSProperties}
          >
            <i aria-hidden="true" />
            <b>{card.label}</b>
          </button>
        ))}
      </div>
      <div className="emh-hero-edition-note">
        <span aria-hidden="true" />
        {activeCard.label} edition · tap a colour, or hover the card
      </div>
    </div>
  );
}

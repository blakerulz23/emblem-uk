'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { CardData } from '@/lib/types';
import { GHB_LAYERS, drawGalaxyHoloBack } from '@/lib/galaxyHoloBackLayers';

const CARD_W = 500;
const CARD_H = 700;

interface Props {
  card: CardData;
  width?: number;
}

export default function GalaxyHoloBackCard({ card, width = 500 }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgsRef     = useRef<Partial<Record<string, HTMLImageElement>>>({});
  const loadedRef   = useRef(false);
  const cardRef     = useRef(card);
  cardRef.current   = card;

  const displayH = width * (CARD_H / CARD_W);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width  = CARD_W * dpr;
    canvas.height = CARD_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    drawGalaxyHoloBack(ctx, cardRef.current, CARD_W, CARD_H, imgsRef.current);
  }, []);

  // Load all PNG layers once
  useEffect(() => {
    if (loadedRef.current) { draw(); return; }
    let remaining = GHB_LAYERS.length;
    GHB_LAYERS.forEach(({ key, src }) => {
      const img = new Image();
      img.onload = () => {
        imgsRef.current[key] = img;
        remaining--;
        if (remaining === 0) { loadedRef.current = true; draw(); }
      };
      img.onerror = () => { remaining--; if (remaining === 0) draw(); };
      img.src = src;
    });
  }, [draw]);

  // Redraw when card data changes
  useEffect(() => {
    draw();
  }, [
    draw,
    card.playerName, card.position, card.jerseyNumber, card.teamName,
    card.age, card.classYear, card.height, card.hometown,
    card.backText, card.stats, card.showStats, card.sport,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height: displayH }}
      className="rounded shadow-sm"
    />
  );
}

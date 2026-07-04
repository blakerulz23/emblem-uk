'use client';

import type { CSSProperties } from 'react';
import type { CardTemplate, Details, PuzzleStyle } from './data';
import CardArt from './CardArt';

interface PuzzleArtProps {
  style: PuzzleStyle;
  template: CardTemplate;
  photo: string | null;
  details: Details;
  size?: number;
  outerStyle?: CSSProperties;
}

// Puzzle aspect ratio: 330 x 420 mm (~5:6.36, taller portrait)
const PUZZLE_RATIO = 420 / 330;

export default function PuzzleArt({ style, template, photo, details, size = 240, outerStyle }: PuzzleArtProps) {
  const w = size;
  const h = Math.round(size * PUZZLE_RATIO);

  if (style === 'photo') {
    return (
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 14,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #e6f4ec 0%, #c8e6d4 100%)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 8px 24px rgba(11,11,15,0.12)',
          ...outerStyle,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt="Your photo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: '#2e7d4f', textAlign: 'center', padding: 16 }}>
            Upload a photo
          </span>
        )}
      </div>
    );
  }

  // Card style: render existing card-template at puzzle aspect ratio.
  // CardArt is 5:7 — close to puzzle 5:6.36. Slight crop top/bottom is acceptable.
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(11,11,15,0.12)',
        ...outerStyle,
      }}
    >
      <CardArt template={template} photo={photo} details={details} size={w} />
    </div>
  );
}

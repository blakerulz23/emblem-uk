'use client';

import type { CardTemplate, Details } from './data';

interface JewelryArtProps {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  size?: number;
}

export default function JewelryArt({ size = 200 }: JewelryArtProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, #f7e3a3 0%, #d4af37 35%, #a07d10 75%, #7a5e09 100%)',
        boxShadow: 'inset 0 -6px 14px rgba(0,0,0,0.35), inset 0 6px 14px rgba(255,255,255,0.45), 0 10px 26px rgba(0,0,0,0.25)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display, system-ui)',
        color: '#3d2c08',
        fontWeight: 800,
        fontSize: Math.round(size * 0.18),
        letterSpacing: '0.12em',
        textShadow: '0 1px 0 rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
      }}
      aria-label="Jewelry pendant preview"
    >
      Pendant
    </div>
  );
}

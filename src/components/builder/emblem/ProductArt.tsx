'use client';

import type { CSSProperties } from 'react';
import type { CardTemplate, Details, ProductId, KeychainShape, CharmShape, PhysicalKey, SportId } from './data';
import CardArt from './CardArt';
import PosterArt from './PosterArt';
import StickerArt from './StickerArt';
import KeychainArt from './KeychainArt';
import MagnetArt from './MagnetArt';
import JewelryArt from './JewelryArt';

type Props = {
  product: ProductId;
  template: CardTemplate;
  photo: string | null;
  details: Details;
  size?: number;
  selected?: boolean;
  style?: CSSProperties;
  className?: string;
  // For products that have multiple physical shape options:
  keychainShape?: KeychainShape;
  charmShape?: CharmShape;
  logo?: string | null;
  stats?: Record<string, string>;
  sport?: SportId;
  backText?: string;
  physical?: Record<PhysicalKey, string>;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
};

export default function ProductArt({
  product,
  template,
  photo,
  details,
  size = 200,
  selected,
  style,
  className,
  keychainShape,
  charmShape,
  logo,
  stats,
  sport,
  backText,
  physical,
  photoScale,
  photoOffsetX,
  photoOffsetY,
}: Props) {
  if (product === 'posters') {
    return (
      <div style={style} className={className}>
        <PosterArt template={template} photo={photo} details={details} size={size} selected={selected} />
      </div>
    );
  }
  if (product === 'stickers') {
    return (
      <div style={style} className={className}>
        <StickerArt template={template} photo={photo} details={details} size={size} />
      </div>
    );
  }
  if (product === 'keychains') {
    return (
      <div style={style} className={className}>
        <KeychainArt template={template} photo={photo} details={details} size={size} shape={keychainShape} />
      </div>
    );
  }
  if (product === 'magnets') {
    return (
      <div style={style} className={className}>
        <MagnetArt template={template} photo={photo} details={details} size={size} shape={charmShape} />
      </div>
    );
  }
  if (product === 'jewelry') {
    return (
      <div style={style} className={className}>
        <JewelryArt template={template} photo={photo} details={details} size={size} />
      </div>
    );
  }
  return (
    <div style={style} className={className}>
      <CardArt
        template={template}
        photo={photo}
        details={details}
        size={size}
        selected={selected}
        logo={logo}
        stats={stats}
        sport={sport}
        backText={backText}
        physical={physical}
        photoScale={photoScale}
        photoOffsetX={photoOffsetX}
        photoOffsetY={photoOffsetY}
      />
    </div>
  );
}

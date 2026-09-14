'use client';

import { useState } from 'react';

/**
 * View-only Front/Back switch for the public share page — reuses the same
 * `.uk-card-side-toggle` control/transition style ProductionBuilder.tsx
 * already uses for the builder's own Front/Back toggle, rather than
 * inventing a second design. No editing affordance of any kind: this
 * component only ever swaps which already-approved, already-captured
 * image is shown (frontImageUrl/backImageUrl are both static URLs
 * resolved server-side by resolveCardSharePublicPage — nothing here can
 * regenerate, reinterpret, or alter either image). When there is no
 * back image (the template has no approved back, or the page predates
 * migration 0087), no toggle is rendered at all — just the front image,
 * identical to this page's pre-0087 behaviour.
 */
export default function CardShareFaceToggle({
  frontImageUrl,
  backImageUrl,
}: {
  frontImageUrl: string;
  backImageUrl?: string;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const imageUrl = side === 'back' && backImageUrl ? backImageUrl : frontImageUrl;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={side === 'back' ? "This card's back" : 'A football card made with Emblem'}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          borderRadius: 16,
          boxShadow: '0 14px 30px -18px rgba(0,0,0,.35)',
        }}
      />
      {backImageUrl && (
        <div className="uk-card-side-toggle" style={{ margin: '14px auto 0', justifyContent: 'center' }} aria-label="Choose card side">
          <button type="button" className={side === 'front' ? 'active' : ''} onClick={() => setSide('front')}>Front</button>
          <button type="button" className={side === 'back' ? 'active' : ''} onClick={() => setSide('back')}>Back</button>
        </div>
      )}
    </>
  );
}

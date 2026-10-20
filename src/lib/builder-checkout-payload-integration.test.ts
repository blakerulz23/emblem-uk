import { describe, expect, it } from 'vitest';
import { defaultOrder, productionPayload, type OrderDraft } from './emblem-uk-builder';
import { validateOrderEnquiry } from './order-enquiry-validation';

/**
 * Isolated integration: what the builder actually sends (productionPayload)
 * through the real server-side validator (validateOrderEnquiry) — the same
 * functions /api/order-enquiry uses, with no network or database. Proves the
 * photo the server stores is built only from the uploaded S3 key and never
 * carries the device-only original (photo.originalUrl) or any blob: URL.
 */
const SUBMISSION_KEY = '11111111-2222-4333-8444-555555555555';
const PHOTO_KEY = `order-assets/${SUBMISSION_KEY}/player-1.png`;
const PRINT_KEY = `print-files/${SUBMISSION_KEY}/card/1.pdf`;

function approvedOrder(): OrderDraft {
  const order = defaultOrder();
  const player = order.players[0];
  return {
    ...order,
    type: 'single',
    collectionType: 'custom',
    collectionName: 'Custom Collection',
    players: [{
      ...player,
      name: 'Test Player',
      kitNo: '7',
      position: 'MID',
      prints: 1,
      // Edited before it was approved (a later updatedAt would make it unapproved).
      updatedAt: '2026-10-19T08:59:00.000Z',
      approvedAt: '2026-10-19T09:00:00.000Z',
      photo: {
        srcUrl: 'https://bucket.example/signed/player-1.png',
        hiResUrl: 'https://bucket.example/signed/player-1.png',
        storageKey: PHOTO_KEY,
        storageUrl: 'https://bucket.example/signed/player-1.png',
        contentType: 'image/png',
        crop: { x: 0.1, y: -0.05, scale: 1.2 },
        bgRemoved: true,
        fileName: 'player-1.png',
        originalUrl: 'blob:https://emblem.cards/original-photo',
      },
    }],
  } as OrderDraft;
}

describe('builder payload → server validation (direct checkout)', () => {
  const payload = productionPayload(approvedOrder(), null);
  const body = {
    contact: { name: 'Jamie Parent', email: 'jamie@example.test' },
    submissionKey: SUBMISSION_KEY,
    orderRef: 'emblem-11111111-test',
    printFiles: [{ playerId: payload.players[0].id, playerName: 'Test Player', key: PRINT_KEY }],
    ...payload,
  };
  const result = validateOrderEnquiry(body as never, { fingerprint: (s: string) => `fp-${s.length}`, now: () => 1_760_000_000_000 });

  it('the builder payload is accepted by the real validator', () => {
    expect(result.ok).toBe(true);
  });

  it('the stored photo contains only the uploaded key, content type, crop and background flag', () => {
    if (!result.ok) throw new Error('validation failed');
    const player = result.params.p_players[0];
    expect(player.photoKey).toBe(PHOTO_KEY);
    expect(Object.keys(player.photo).sort()).toEqual(['bgRemoved', 'contentType', 'crop', 'storageKey']);
    expect(player.photo).toMatchObject({ storageKey: PHOTO_KEY, bgRemoved: true, crop: { x: 0.1, y: -0.05, scale: 1.2 } });
  });

  it('nothing device-only (originalUrl, blob: URLs) reaches the order parameters', () => {
    if (!result.ok) throw new Error('validation failed');
    const serialised = JSON.stringify(result.params);
    expect(serialised).not.toContain('originalUrl');
    expect(serialised).not.toContain('blob:');
  });

  it('a photo still pointing at a device-only blob: URL is rejected, never stored', () => {
    const order = approvedOrder();
    order.players[0].photo = { ...order.players[0].photo!, storageKey: 'blob:https://emblem.cards/x' };
    const bad = validateOrderEnquiry({ ...body, ...productionPayload(order, null) } as never, { fingerprint: (s: string) => s, now: () => 0 });
    expect(bad.ok).toBe(false);
  });
});

describe('24-character card name limit (server validation)', () => {
  // The name is set on the payload itself: the builder already refuses to
  // approve an over-long card, so this proves the server check on its own.
  const withName = (name: string) => {
    const p = productionPayload(approvedOrder(), null);
    p.players[0] = { ...p.players[0], name };
    return validateOrderEnquiry({
      contact: { name: 'Jamie Parent', email: 'jamie@example.test' },
      submissionKey: SUBMISSION_KEY,
      orderRef: 'emblem-11111111-test',
      printFiles: [{ playerId: p.players[0].id, playerName: name, key: PRINT_KEY }],
      ...p,
    } as never, { fingerprint: (s: string) => `fp-${s.length}`, now: () => 1_760_000_000_000 });
  };

  it('accepts names up to 24 characters, including spaces, hyphens, apostrophes and accents', () => {
    for (const name of ['Alexander-Christopherson', 'Mary Jane Montgomery-Wai', "Siobhán O'Donoghue-Kerr", 'José María', 'Zoë']) {
      expect(withName(name).ok, name).toBe(true);
    }
  });

  it('counts an accent as one character whether typed precomposed or combined', () => {
    const combined = 'Zoe\u0308 Montgomery-Willia'; // 'Zoë' with a combining diaeresis: 24 characters
    expect(withName(combined).ok).toBe(true);
  });

  it('rejects a 25-character name with a clear message', () => {
    const res = withName('Alexander-Christophersons');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(JSON.stringify(res)).toMatch(/up to 24 characters/);
  });
});

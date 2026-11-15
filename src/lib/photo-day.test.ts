import { describe, expect, it } from 'vitest';
import {
  createPhotographerToken, hashPhotographerToken, parseLinkHours, parsePhotoDayConsentInput, parsePhotoDayCreateInput, photoDayChildLabel, photoDayParentReasonMessage,
  photoDayReasonMessage, photoDayStorageKey, photographerUploadUrl, readBearerToken, readRpcOutcome,
} from './photo-day';

const DAY = '0b6c4d2e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
// The storage key check in migration 0104.
const SQL_KEY_RE = /^photo-day\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

describe('photo day helpers', () => {
  it('issues a token whose hash matches the database format and never equals the token', () => {
    const { token, hash } = createPhotographerToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhotographerToken(token)).toBe(hash);
  });

  it('hashing a malformed token returns null instead of throwing', () => {
    expect(hashPhotographerToken('short')).toBeNull();
    expect(hashPhotographerToken('a'.repeat(44))).toBeNull();
  });

  it('reads only a well-formed Bearer header', () => {
    const { token } = createPhotographerToken();
    const h = (v: string | null) => ({ get: (n: string) => (n === 'authorization' ? v : null) });
    expect(readBearerToken(h(`Bearer ${token}`))).toBe(token);
    expect(readBearerToken(h(token))).toBeNull();
    expect(readBearerToken(h(`Bearer ${token}x`))).toBeNull();
    expect(readBearerToken(h(null))).toBeNull();
  });

  it('puts the token in the URL fragment, never the path or query', () => {
    const url = new URL(photographerUploadUrl('https://emblem.example', DAY, 'T'.repeat(43)));
    expect(url.pathname).toBe(`/photo-day/upload/${DAY}`);
    expect(url.search).toBe('');
    expect(url.hash).toBe(`#${'T'.repeat(43)}`);
  });

  it('builds storage keys the 0104 check constraint accepts, unique per call', () => {
    const a = photoDayStorageKey(DAY);
    expect(a).toMatch(SQL_KEY_RE);
    expect(a.startsWith(`photo-day/${DAY}/`)).toBe(true);
    expect(photoDayStorageKey(DAY)).not.toBe(a);
    expect(() => photoDayStorageKey('../other')).toThrow();
  });

  it('parses create input with a default cap and rejects bad values', () => {
    expect(parsePhotoDayCreateInput({ scheduledFor: '2026-11-22', venueLabel: ' Astley ', photographerName: 'Blake' }))
      .toEqual({ scheduledFor: '2026-11-22', venueLabel: 'Astley', photographerName: 'Blake', maxPhotos: 400 });
    expect(parsePhotoDayCreateInput({ scheduledFor: '22/11/2026', venueLabel: 'Astley', photographerName: 'Blake' })).toBeNull();
    expect(parsePhotoDayCreateInput({ scheduledFor: '2026-11-22', venueLabel: 'A', photographerName: 'Blake' })).toBeNull();
    expect(parsePhotoDayCreateInput({ scheduledFor: '2026-11-22', venueLabel: 'Astley', photographerName: 'Blake', maxPhotos: 1001 })).toBeNull();
    expect(parsePhotoDayCreateInput({ scheduledFor: '2026-11-22', venueLabel: 'Astley', photographerName: 'Blake', maxPhotos: 2.5 })).toBeNull();
    expect(parsePhotoDayCreateInput(null)).toBeNull();
  });

  it('only accepts the offered link durations', () => {
    expect(parseLinkHours(48)).toBe(48);
    expect(parseLinkHours('168')).toBe(168);
    expect(parseLinkHours(169)).toBeNull();
    expect(parseLinkHours(5)).toBeNull();
  });

  it('turns database outcomes into ok/reason and reasons into staff copy', () => {
    expect(readRpcOutcome({ ok: true, photoDayId: DAY })).toEqual({ ok: true, value: { ok: true, photoDayId: DAY } });
    expect(readRpcOutcome({ ok: false, reason: 'no_photo_day_consent' })).toEqual({ ok: false, reason: 'no_photo_day_consent' });
    expect(readRpcOutcome(null)).toEqual({ ok: false, reason: 'unknown' });
    expect(photoDayReasonMessage('no_photo_day_consent')).toMatch(/Photo Day permission/);
    expect(photoDayReasonMessage('something_new')).toMatch(/Refresh/);
  });

  it('labels a child from the participation display columns only', () => {
    expect(photoDayChildLabel({ display_first_name: 'Sam', display_surname_initial: 'T', squad_number: 7 }, 0)).toBe('Sam T. · #7');
    expect(photoDayChildLabel({ display_first_name: null, display_surname_initial: null, squad_number: null }, 2)).toBe('Child 3 (name not given yet)');
  });

  it('parses a parent’s Photo Day choice with the same limits as the database', () => {
    expect(parsePhotoDayConsentInput({ granted: false, firstName: 'ignored' })).toEqual({ granted: false });
    expect(parsePhotoDayConsentInput({ granted: true, firstName: ' Zoë ', surnameInitial: 'k', squadNumber: '' }))
      .toEqual({ granted: true, firstName: 'Zoë', surnameInitial: 'K', squadNumber: null });
    expect(parsePhotoDayConsentInput({ granted: true, firstName: 'Sam', surnameInitial: 'T', squadNumber: 7 })).toMatchObject({ squadNumber: 7 });
    expect(parsePhotoDayConsentInput({ granted: true, firstName: 'Sam', surnameInitial: 'TH' })).toBeNull();
    expect(parsePhotoDayConsentInput({ granted: true, firstName: '', surnameInitial: 'T' })).toBeNull();
    expect(parsePhotoDayConsentInput({ granted: true, firstName: 'A'.repeat(25), surnameInitial: 'T' })).toBeNull();
    expect(parsePhotoDayConsentInput({ granted: true, firstName: 'Sam', surnameInitial: 'T', squadNumber: 1000 })).toBeNull();
    expect(parsePhotoDayConsentInput({ granted: 'true' })).toBeNull();
    expect(photoDayParentReasonMessage('photo_day_already_taken')).toMatch(/already been taken/);
  });
});

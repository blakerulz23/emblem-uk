import { readFileSync } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { appBaseUrl, SITE_URL } from './site';
import { buildNfcCardUrl } from '@/lib/nfc-link';
import { CARD_SHARE_LINK_URL, CARD_SHARE_MESSAGE_TEXT, buildCardShareMessageText, cardSharePublicPageUrl } from '@/lib/card-share';

/**
 * Every absolute link Emblem sends out — NFC chips, payment and preview
 * links, emails, card shares — must use the production domain. Before this
 * was pinned, production built links on emblem-uk.vercel.app, card shares
 * hard-coded that host, and an unset variable fell back to a
 * login-protected Vercel alias that families could not open.
 */
const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe('appBaseUrl', () => {
  it('falls back to https://emblem.cards when NEXT_PUBLIC_SITE_URL is unset or blank', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(appBaseUrl()).toBe('https://emblem.cards');
    process.env.NEXT_PUBLIC_SITE_URL = '   ';
    expect(appBaseUrl()).toBe(SITE_URL);
  });

  it('uses NEXT_PUBLIC_SITE_URL when set, without a trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://emblem.cards/';
    expect(appBaseUrl()).toBe('https://emblem.cards');
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example';
    expect(appBaseUrl()).toBe('https://preview.example');
  });

  it('builds NFC, card-share and share-message links on emblem.cards with no configuration', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(buildNfcCardUrl('TOKEN1')).toBe('https://emblem.cards/os?card=TOKEN1');
    expect(cardSharePublicPageUrl('a'.repeat(64))).toBe(`https://emblem.cards/card-share/${'a'.repeat(64)}`);
    expect(CARD_SHARE_LINK_URL).toBe('https://emblem.cards/builder');
    expect(CARD_SHARE_MESSAGE_TEXT).not.toMatch(/vercel\.app/);
    expect(buildCardShareMessageText(cardSharePublicPageUrl('b'.repeat(64)))).not.toMatch(/vercel\.app/);
  });
});

describe('no outbound link builder hard-codes a Vercel host', () => {
  const LINK_BUILDERS = [
    'src/app/api/builder-authority/guardian-email/route.ts',
    'src/app/api/os/coach-invites/route.ts',
    'src/app/api/staff/squad-invites/[id]/finalise-pricing/route.ts',
    'src/lib/card-share.ts',
    'src/lib/nfc-link.ts',
    'src/lib/send-coach-invite-email.ts',
    'src/lib/send-invite-email.ts',
    'src/lib/send-squad-invite-notification-email.ts',
    'src/lib/send-staff-notification-email.ts',
    'src/lib/send-team-invite-email.ts',
  ];

  for (const file of LINK_BUILDERS) {
    it(`${file} takes its origin from appBaseUrl() and contains no *.vercel.app URL`, () => {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/https?:\/\/[a-z0-9.-]+\.vercel\.app/i);
      expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_SITE_URL/);
      expect(source).toMatch(/appBaseUrl\(\)/);
    });
  }
});

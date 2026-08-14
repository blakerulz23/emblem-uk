import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { isSyntheticSquadInvitePreviewEnabled } from './squad-invite-preview-mode';
import { hasSafeRequestOrigin, hasSquadInviteContextCookie, hasValidSquadInviteCsrf, safeSquadInviteReturnPath } from './squad-invite-request-security';
import { consumeSquadInviteRateLimit } from './squad-invite-rate-limit';

const read = (path: string) => readFileSync(path, 'utf8');
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Squad Invite security correction contract', () => {
  it('never sends raw invitation credentials in an HTTP request path', () => {
    expect(() => read('src/app/squad-invite/join/[token]/route.ts')).toThrow();
    const issuers = read('src/app/api/squad-invites/[id]/invitation-link/route.ts') + read('src/app/api/staff/squad-invites/[id]/approve/route.ts');
    expect(issuers).toContain('/squad-invite/access#token=${credential.token}');
    const access = read('src/app/squad-invite/access/InvitationAccess.tsx');
    expect(access).toContain("window.history.replaceState(null, '', '/squad-invite/access')");
    expect(access).toContain("body: JSON.stringify({ token })");
  });

  it('uses root-scoped strict HttpOnly context cookies and explicit CSRF checks', () => {
    const exchange = read('src/app/api/squad-invite-links/exchange/route.ts');
    expect(exchange).toContain("sameSite: 'strict'");
    expect(exchange).toContain("path: '/'");
    expect(exchange.match(/httpOnly: true/g)).toHaveLength(1);
    expect(exchange).toContain('SQUAD_INVITE_CSRF_COOKIE, csrfToken, { httpOnly: false');
    for (const path of ['src/app/api/squad-invite-links/participation/route.ts', 'src/app/api/squad-invite-participations/[id]/commit/route.ts']) {
      expect(read(path)).toContain('hasValidSquadInviteCsrf(request)');
    }
  });

  it('rejects absent, cross-origin and mismatched CSRF evidence', () => {
    const token = 'a'.repeat(43);
    const request = (origin: string, header = token, cookie = token) => new NextRequest('https://preview.emblem.test/api/squad-invite-links/participation', {
      method: 'POST', headers: { origin, 'x-emblem-csrf': header, cookie: `emblem_squad_csrf=${cookie}; emblem_squad_invite_link=${'b'.repeat(43)}` },
    });
    expect(hasSafeRequestOrigin(request('https://preview.emblem.test'))).toBe(true);
    expect(hasValidSquadInviteCsrf(request('https://preview.emblem.test'))).toBe(true);
    expect(hasSquadInviteContextCookie(request('https://preview.emblem.test'))).toBe(true);
    expect(hasValidSquadInviteCsrf(request('https://evil.example'))).toBe(false);
    expect(hasValidSquadInviteCsrf(request('https://preview.emblem.test', 'b'.repeat(43)))).toBe(false);
    expect(hasValidSquadInviteCsrf(new NextRequest('https://preview.emblem.test/api', { method: 'POST' }))).toBe(false);
  });

  it('rate limits OTP request/resend and failed verification with opaque IP and email buckets', () => {
    const limiter = read('src/lib/squad-invite-rate-limit.ts');
    expect(limiter).toContain("'otp-request': { ip: 5, subject: 3 }");
    expect(limiter).toContain("'otp-verify': { ip: 10, subject: 5 }");
    expect(limiter).toContain("createHmac('sha256', secret)");
    expect(limiter).not.toContain('p_bucket_hash: identifier');
    expect(limiter).toContain("process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV");
    expect(limiter).toContain("SQUAD_INVITE_ALLOW_INSECURE_LOCAL_RATE_LIMIT === 'true'");
  });

  it('pins every authentication return to the clean join route', () => {
    expect(safeSquadInviteReturnPath('/squad-invite/join')).toBe('/squad-invite/join');
    expect(safeSquadInviteReturnPath('https://evil.example')).toBe('/squad-invite/join');
    expect(safeSquadInviteReturnPath('//evil.example')).toBe('/squad-invite/join');
    expect(safeSquadInviteReturnPath('/builder')).toBe('/squad-invite/join');
  });

  it('fails review mode closed in production and requires the dedicated preview flag', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED = 'true';
    expect(isSyntheticSquadInvitePreviewEnabled()).toBe(false);
    process.env.VERCEL_ENV = 'preview';
    delete process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED;
    expect(isSyntheticSquadInvitePreviewEnabled()).toBe(false);
    process.env.SQUAD_INVITE_REVIEW_PREVIEW_ENABLED = 'true';
    expect(isSyntheticSquadInvitePreviewEnabled()).toBe(true);
  });

  it('fails rate limiting closed without a secret unless local bypass is explicitly opted in', async () => {
    delete process.env.SQUAD_INVITE_RATE_LIMIT_SECRET;
    delete process.env.SQUAD_INVITE_ALLOW_INSECURE_LOCAL_RATE_LIMIT;
    delete process.env.VERCEL_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const headers = { get: () => null };
    expect(await consumeSquadInviteRateLimit(headers, 'resolve')).toBe(false);
    process.env.SQUAD_INVITE_ALLOW_INSECURE_LOCAL_RATE_LIMIT = 'true';
    expect(await consumeSquadInviteRateLimit(headers, 'resolve')).toBe(true);
    process.env.VERCEL_ENV = 'preview';
    expect(await consumeSquadInviteRateLimit(headers, 'resolve')).toBe(false);
  });

  it('labels the review clearly and imports no Supabase or Shopify client', () => {
    const review = read('src/app/review/squad-invite/page.tsx');
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('Synthetic product preview');
    expect(review + component).not.toMatch(/(?:from|import\s*)['"][^'"]*(?:supabase|shopify|service-role)/i);
    const middleware = read('src/middleware.ts');
    expect(middleware).toContain('reviewMode && realSquadInviteSurface');
    expect(middleware).toContain('isRealSquadInviteSurfacePath(path)');
    expect(read('src/lib/squad-invite-preview-safety.ts')).toContain("'/api/staff/squad-invites'");
  });

  it('keeps synthetic preview copy payment-neutral and navigation labels non-interactive', () => {
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('Each parent creates their child’s card individually. Parents pay after the team price is confirmed.');
    expect(component).toContain('Synthetic product preview');
    expect(component).toContain('No database · No payments · No real child data');
    expect(component).not.toContain('builds and pays individually');
    expect(component).not.toContain('payment-neutral commitment');
    expect(component).not.toContain('contacts Shopify');
    expect(component).not.toContain('className="si-help-button"');
    expect(component).not.toContain('emblem-footer-logo.png');
    expect(component).toContain('className="si-footer-identity">© Emblem');
  });

  it('uses the canonical ten-card threshold for customer-facing progress', () => {
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('8 of 10');
    expect(component).toContain('value="8" max="10"');
    expect(component).toContain('80%');
    expect(component).toContain('Estimated squad size: 15');
    expect(component).not.toContain('8 / 15');
    expect(component).not.toContain('53%');
  });

  it('keeps public invitation artwork generic and private builder artwork synthetic', () => {
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('<ProductCard generic/>');
    expect(component).toContain("generic ? 'YOUR PLAYER' : 'MAYA R.'");
    expect(component).toContain('Generic player card example with no child identity');
    expect(component).toContain('Upload or replace photograph');
  });

  it('uses plain parent permission and card-saved language', () => {
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('Before you save the card');
    expect(component).toContain('Save my child’s card');
    expect(component).toContain('Your child’s card is saved');
    expect(component).toContain('Card design saved');
    expect(component).not.toContain('Private registration — deferred until after the pilot');
  });

  it('separates reviewer navigation and staff safeguards from customer permissions', () => {
    const component = read('src/app/dev/squad-invite-preview/SquadInvitePreview.tsx');
    expect(component).toContain('Reviewer navigation — synthetic preview only');
    expect(component).toContain('Reviewer control');
    expect(component).toContain('No child roster uploaded');
    expect(component).toContain('Approve Squad Invite');
    expect(component).not.toContain('DBS');
  });
});

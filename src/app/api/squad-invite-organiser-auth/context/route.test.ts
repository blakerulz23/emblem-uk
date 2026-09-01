import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/squad-invite-organiser-auth/context/route.ts', 'utf8');

describe('GET /api/squad-invite-organiser-auth/context', () => {
  it('opts out of static rendering so every visitor gets a fresh CSRF token, not a cached one', () => {
    expect(source).toContain("export const dynamic = 'force-dynamic';");
  });

  it('is gated behind the Squad Invite MVP flag', () => {
    expect(source).toContain('isSquadInviteMvpEnabled()');
  });

  it('sets a strict, same-site, non-httpOnly CSRF cookie the client can read and echo back', () => {
    expect(source).toContain("sameSite:'strict'");
    expect(source).toContain('httpOnly:false');
    expect(source).toContain("secure:process.env.NODE_ENV==='production'");
  });

  it('reuses an existing well-formed token instead of always minting a new one, so the several sibling components on the manage page that each call this route independently converge on one cookie value instead of invalidating each other', () => {
    expect(source).toContain('cookies().get(SQUAD_INVITE_CSRF_COOKIE)?.value');
    expect(source).toContain('CSRF_TOKEN_RE.test(existingToken)?existingToken:randomBytes(32).toString(\'base64url\')');
  });
});

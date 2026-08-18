import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const PAGE = 'src/app/squad-invite/start/page.tsx';
const ORGANISER_START = 'src/app/squad-invite/start/OrganiserStart.tsx';

// Guards a real, confirmed bug: Supabase Auth session cookies are shared
// across browser tabs, so an organiser who types one email into this form
// can have the request attributed to a different email a stale tab is
// still signed in as — with no indication anywhere that this happened.
// This surfaces which email the current session is actually signed in as,
// before submission, matching the pattern used for staff.
describe('Squad Invite start — the organiser can see which email they are actually signed in as', () => {
  it('the page passes the verified session email down to OrganiserStart', () => {
    const source = read(PAGE);
    expect(source).toContain('initialSignedInEmail={user.email}');
  });

  it('OrganiserStart accepts and stores the initial signed-in email', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('initialSignedInEmail');
    expect(source).toContain('useState<string|undefined>(initialSignedInEmail)');
  });

  it('a fresh OTP verification updates the signed-in email to the one just verified', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('setSignedInEmail(email)');
  });

  it('the signed-in email is rendered visibly once verified, before the request is submitted', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('Signed in as:');
    expect(source).toContain("stage==='existing'||stage==='details'||stage==='review'");
  });
});

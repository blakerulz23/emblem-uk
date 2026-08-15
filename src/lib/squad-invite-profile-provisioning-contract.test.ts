import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const ORGANISER_ROUTE = 'src/app/api/squad-invite-organiser-auth/verify-code/route.ts';
const PARENT_ROUTE = 'src/app/api/squad-invite-auth/verify-code/route.ts';

describe('Squad Invite OTP routes provision a minimal profile', () => {
  it('both routes upsert only { id } with a non-overwriting conflict resolution, using the request-scoped client', () => {
    for (const path of [ORGANISER_ROUTE, PARENT_ROUTE]) {
      const source = read(path);
      expect(source).toMatch(/const\s+supabase\s*=\s*createClient\(\)/);
      expect(source).toContain(".from('profiles').upsert({");
      expect(source).toMatch(/upsert\(\{\s*id\s*:\s*data\.user\.id\s*\}\s*,\s*\{\s*onConflict\s*:\s*'id'\s*,\s*ignoreDuplicates\s*:\s*true\s*\}\)/);
    }
  });

  it('neither route assigns a role, display_name, or email in the profile upsert payload', () => {
    for (const path of [ORGANISER_ROUTE, PARENT_ROUTE]) {
      const source = read(path);
      const upsertCall = source.slice(source.indexOf('.upsert('), source.indexOf('.upsert(') + 120);
      expect(upsertCall).not.toContain('role');
      expect(upsertCall).not.toContain('display_name');
      expect(upsertCall).not.toContain('email');
    }
  });

  it('neither route returns success without checking the profile upsert error', () => {
    for (const path of [ORGANISER_ROUTE, PARENT_ROUTE]) {
      const source = read(path);
      expect(source).toContain('profileError');
      expect(source).toMatch(/if\s*\(\s*profileError\s*\)/);
    }
  });

  it('provisioning failure logs only an operation name and error code, never the raw error object, email, code, or user id', () => {
    for (const path of [ORGANISER_ROUTE, PARENT_ROUTE]) {
      const source = read(path);
      const logCall = source.slice(source.indexOf('console.error('), source.indexOf('console.error(') + 200);
      expect(logCall).toContain('profile-upsert');
      expect(logCall).toContain('profileError.code');
      expect(logCall).not.toContain('profileError.message');
      expect(logCall).not.toContain('profileError.details');
      expect(logCall).not.toContain('profileError.hint');
      expect(logCall).not.toMatch(/\bemail\b/);
      expect(logCall).not.toMatch(/\buser\.id\b|data\.user\.id/);
    }
  });

  it('preserves existing OTP behaviour: 6-8 digit code acceptance and fixed same-origin return handling are unchanged', () => {
    expect(read(ORGANISER_ROUTE)).toContain('/^\\d{6,8}$/');
    expect(read(ORGANISER_ROUTE)).toContain("returnTo:'/squad-invite/start'");
    expect(read(PARENT_ROUTE)).toContain('/^\\d{6,8}$/');
    expect(read(PARENT_ROUTE)).toContain('safeSquadInviteReturnPath(body?.returnTo)');
  });

  it('does not attempt profile provisioning before verifyOtp has succeeded', () => {
    for (const path of [ORGANISER_ROUTE, PARENT_ROUTE]) {
      const source = read(path);
      expect(source.indexOf('verifyOtp')).toBeLessThan(source.indexOf(".from('profiles')"));
    }
  });
});

describe('Squad Invite profile foreign keys — live committed schema contract', () => {
  it('squad_invite_requests.organiser_profile_id references profiles(id)', () => {
    // The column is declared once, in 0052 (0050 defines a same-named
    // column on the separate squad_invites table, not this one).
    const migration = read('supabase/migrations/0052_squad_invite_review_foundation.sql');
    const tableStart = migration.indexOf('create table public.squad_invite_requests');
    const tableDefinition = migration.slice(tableStart, tableStart + 1500);
    expect(tableStart).toBeGreaterThan(-1);
    expect(tableDefinition).toMatch(/organiser_profile_id\s+uuid\s+not\s+null\s+references\s+public\.profiles\s*\(\s*id\s*\)/);
  });

  it('squad_invite_participations.guardian_profile_id references profiles(id)', () => {
    const migration = read('supabase/migrations/0050_squad_invite_foundation.sql');
    const tableStart = migration.indexOf('create table public.squad_invite_participations');
    const tableDefinition = migration.slice(tableStart, tableStart + 1500);
    expect(tableStart).toBeGreaterThan(-1);
    expect(tableDefinition).toMatch(/guardian_profile_id\s+uuid\s+references\s+public\.profiles\s*\(\s*id\s*\)/);
  });
});

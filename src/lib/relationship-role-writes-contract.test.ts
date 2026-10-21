import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * profiles.role is a view preference, set only by trusted server paths
 * through ensure_profile_role (migration 0088). These structural checks keep
 * it that way: no browser code writes profiles at all, no server code writes
 * a role as the signed-in user, and every coach_team/guardians write goes
 * through the service role or a trusted function.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.|\.test-support\./.test(name) ? [full] : [];
  });
}
const files = sourceFiles('src').map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('profile role writes', () => {
  it('no client component writes profiles', () => {
    const offenders = files.filter((f) => /^['"]use client['"]/m.test(f.text) && /from\(\s*['"]profiles['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(code(f.text)));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('no code writes a role into profiles directly (only ensure_profile_role sets it)', () => {
    const offenders = files.filter((f) => /from\(\s*['"]profiles['"]\s*\)\s*\.(insert|update|upsert)\(\s*\{[^}]*\brole\s*:/.test(code(f.text)) ||
      /profileUpsert[^;]*\brole\s*:/.test(code(f.text)));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('RoleSelect and ActivationGate keep the role choice client-side', () => {
    for (const f of ['src/app/os/screens/RoleSelect.tsx', 'src/app/os/overlays/ActivationGate.tsx']) {
      expect(code(readFileSync(f, 'utf8'))).not.toMatch(/from\(\s*['"]profiles['"]\s*\)/);
    }
  });
});

describe('relationship writes', () => {
  it('nothing writes coach_team directly; assignments go through trusted functions', () => {
    const offenders = files.filter((f) => /from\(\s*['"]coach_team['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(code(f.text)));
    expect(offenders.map((f) => f.file)).toEqual([]);
  });

  it('direct coach links and coach invites are never written directly by app code', () => {
    // Creation goes only through redeem_coach_invite (atomic claim + link),
    // removal only through remove_direct_coach_link.
    const linkWrites = files.filter((f) => /from\(\s*['"]coach_players['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(code(f.text)));
    expect(linkWrites.map((f) => f.file)).toEqual([]);
    // Coach invites are created by a guardian's own session (RLS); nothing
    // consumes or edits one except redeem_coach_invite.
    const inviteEdits = files.filter((f) => /from\(\s*['"]coach_invites['"]\s*\)\s*\.(update|upsert|delete)\(/.test(code(f.text)));
    expect(inviteEdits.map((f) => f.file)).toEqual([]);
    const redeem = readFileSync('src/app/api/os/coach-invites/redeem/route.ts', 'utf8');
    expect(code(redeem)).toContain("rpc('redeem_coach_invite'");
    expect(code(redeem)).not.toMatch(/ensureProfileRole|ensure_profile_role/);
  });

  it('every guardians insert records where it came from', () => {
    const inserts = files.flatMap((f) =>
      Array.from(code(f.text).matchAll(/from\(\s*['"]guardians['"]\s*\)\s*\.insert\(([\s\S]*?)\);/g)).map((m) => ({ file: f.file, payload: m[1] }))
    );
    expect(inserts.length).toBeGreaterThan(0);
    for (const i of inserts) expect(i.payload, i.file).toMatch(/created_via:\s*'(card_claim|guardian_invite|staff)'/);
  });
});

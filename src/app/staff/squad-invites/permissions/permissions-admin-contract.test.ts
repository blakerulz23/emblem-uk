import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('src/app/staff/squad-invites/permissions/page.tsx', 'utf8');
const toggleSource = readFileSync('src/app/staff/squad-invites/permissions/PermissionToggle.tsx', 'utf8');
const grantSource = readFileSync('src/app/api/staff/squad-invites/permissions/grant/route.ts', 'utf8');
const revokeSource = readFileSync('src/app/api/staff/squad-invites/permissions/revoke/route.ts', 'utf8');
const panelSource = readFileSync('src/app/staff/squad-invites/StaffIdentityPanel.tsx', 'utf8');

describe('Staff permissions admin page — gated on Approver, the tier every other consequential action already requires', () => {
  it('requires squad_invite_approver specifically, not the reviewer-or-approver read access other pages use', () => {
    expect(pageSource).toContain("requireSquadInvitePermission(createClient(), 'squad_invite_approver')");
  });

  it('follows the same 401-vs-403 split as every other staff page — 401 redirects to login, 403 renders notFound()', () => {
    expect(pageSource).toMatch(/if\s*\(\s*access\.status\s*===\s*401\s*\)\s*redirect\(/);
    expect(pageSource).toContain('notFound();');
  });

  it('never selects email from profiles — email only exists on auth.users, resolved via the admin API', () => {
    expect(pageSource).not.toMatch(/\.select\([^)]*email/i);
    expect(pageSource).toContain("select('profile_id,profiles(display_name)')");
    expect(pageSource).toContain('service.auth.admin.getUserById(r.profile_id)');
    expect(pageSource).not.toContain('.auth.admin.listUsers(');
  });

  it('renders one PermissionToggle per permission per staff row, backed by the real granted state', () => {
    expect(pageSource).toContain('<PermissionToggle staffProfileId={r.profileId} permission="squad_invite_reviewer" label="Reviewer" granted={r.reviewer} />');
    expect(pageSource).toContain('<PermissionToggle staffProfileId={r.profileId} permission="squad_invite_approver" label="Approver" granted={r.approver} />');
  });

  it('has a back link to the queue and stays clear of the fixed disposable notice', () => {
    expect(pageSource).toContain('href="/staff/squad-invites"');
    expect(pageSource).toContain('pb-28');
  });
});

describe('PermissionToggle — grant is safe, revoke is confirmed', () => {
  it('confirms before revoking but never before granting', () => {
    expect(toggleSource).toContain('if (granted && !window.confirm(');
  });

  it('posts to grant or revoke depending on current state, and prevents a double submission', () => {
    expect(toggleSource).toContain("granted ? '/api/staff/squad-invites/permissions/revoke' : '/api/staff/squad-invites/permissions/grant'");
    expect(toggleSource).toContain('if (pending) return;');
  });

  it('has accessible busy/error states', () => {
    expect(toggleSource).toContain('aria-busy={pending}');
    expect(toggleSource).toContain('role="alert"');
  });
});

describe('Grant/revoke routes — Approver-gated, delegate to the security-definer RPCs, never write the table directly', () => {
  for (const [name, source, rpc] of [
    ['grant', grantSource, 'grant_squad_invite_staff_permission'],
    ['revoke', revokeSource, 'revoke_squad_invite_staff_permission'],
  ] as const) {
    it(`${name} route requires squad_invite_approver and validates the permission enum before calling the RPC`, () => {
      expect(source).toContain("requireSquadInvitePermission(createClient(), 'squad_invite_approver')");
      expect(source).toContain("body?.permission === 'squad_invite_reviewer' || body?.permission === 'squad_invite_approver'");
      expect(source).toContain(`rpc('${rpc}'`);
      expect(source).not.toMatch(/squad_invite_staff_permissions['"]\)\.(insert|update)\(/);
    });
  }

  it('grant passes the acting staff as the granter; revoke passes the acting staff as the revoker', () => {
    expect(grantSource).toContain('p_granted_by_staff_profile_id: staff.userId');
    expect(revokeSource).toContain('p_revoked_by_staff_profile_id: staff.userId');
  });
});

describe('StaffIdentityPanel — the new nav link only appears for an Approver', () => {
  it('gates the "Manage permissions" link on squad_invite_approver', () => {
    expect(panelSource).toContain("permissions.includes('squad_invite_approver')");
    expect(panelSource).toContain('href="/staff/squad-invites/permissions"');
  });
});

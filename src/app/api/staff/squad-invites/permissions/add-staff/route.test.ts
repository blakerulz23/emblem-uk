import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/staff/squad-invites/permissions/add-staff/route.ts', 'utf8');

describe('POST /api/staff/squad-invites/permissions/add-staff', () => {
  it('requires squad_invite_approver, same as grant/revoke', () => {
    expect(source).toContain("requireSquadInvitePermission(createClient(), 'squad_invite_approver')");
  });

  it('validates the email shape before calling the RPC', () => {
    expect(source).toContain("if (!email.includes('@')) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });");
  });

  it('delegates to promote_email_to_staff, never writing staff_accounts directly', () => {
    expect(source).toContain("rpc('promote_email_to_staff'");
    expect(source).not.toMatch(/staff_accounts['"]\)\.(insert|update)\(/);
  });

  it('maps a not-found email to a clear, specific message rather than a generic error', () => {
    expect(source).toContain("'This email has never signed in to Emblem — they need an account first.'");
    expect(source).toContain('if (!result.found) {');
  });

  it('gates on the closed-pilot flag like every other Squad Invite staff route', () => {
    expect(source).toContain('isSquadInviteMvpEnabled()');
  });
});

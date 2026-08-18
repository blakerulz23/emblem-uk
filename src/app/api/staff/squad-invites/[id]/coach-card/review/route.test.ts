import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/staff/squad-invites/[id]/coach-card/review/route.ts', 'utf8');

describe('POST /api/staff/squad-invites/[id]/coach-card/review — staff lock/request-changes', () => {
  it('requires Approver, same level as approve/cancel-approval/finalise-pricing — not the reviewer-level permission', () => {
    expect(source).toContain("requireSquadInvitePermission(createClient(), 'squad_invite_approver')");
  });

  it('only accepts lock or request_changes as an action', () => {
    expect(source).toContain("body?.action === 'lock' || body?.action === 'request_changes'");
  });

  it('delegates the state transition to review_squad_invite_coach_card, passing the acting staff profile id', () => {
    expect(source).toContain("rpc('review_squad_invite_coach_card'");
    expect(source).toContain('p_staff_profile_id: staff.userId');
  });

  it('gates on the closed-pilot flag like every other Squad Invite staff route', () => {
    expect(source).toContain('isSquadInviteMvpEnabled()');
  });
});

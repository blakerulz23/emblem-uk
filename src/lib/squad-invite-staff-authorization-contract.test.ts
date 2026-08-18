import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const QUEUE_PAGE = 'src/app/staff/squad-invites/page.tsx';
const DETAIL_PAGE = 'src/app/staff/squad-invites/[reference]/page.tsx';
const REVIEW_ROUTE = 'src/app/api/staff/squad-invites/[id]/review/route.ts';
const APPROVE_ROUTE = 'src/app/api/staff/squad-invites/[id]/approve/route.ts';
const CANCEL_ROUTE = 'src/app/api/staff/squad-invites/[id]/cancel-approval/route.ts';
const RESEND_ROUTE = 'src/app/api/staff/squad-invites/[id]/notifications/[outboxId]/resend/route.ts';

describe('Squad Invite staff read access — reviewer OR approver, no redirect loop', () => {
  it('the queue and detail pages check both permissions for read access, not one hardcoded permission', () => {
    for (const page of [QUEUE_PAGE, DETAIL_PAGE]) {
      const source = read(page);
      expect(source).toMatch(/requireSquadInvitePermission\(createClient\(\),\s*\[\s*'squad_invite_reviewer'\s*,\s*'squad_invite_approver'\s*\]\s*\)/);
    }
  });

  it('regression: a 403 (authenticated staff lacking the permission) never redirects to /staff/login — that is the exact redirect-loop bug', () => {
    // The bug: /staff/login's own requireStaff() check only verifies
    // generic staff_accounts membership. A signed-in staff member who
    // lacks squad-invite permission already satisfies that generic check,
    // so redirecting them to login just bounces them straight back,
    // forever. The fix is structural: only a 401 may redirect to login;
    // a 403 must resolve locally (notFound()), never round-trip through
    // a page whose own pass condition is weaker than what sent them there.
    for (const page of [QUEUE_PAGE, DETAIL_PAGE]) {
      const source = read(page);
      expect(source).toMatch(/if\s*\(\s*!access\.ok\s*\)\s*\{\s*if\s*\(\s*access\.status\s*===\s*401\s*\)\s*redirect\(/);
      expect(source).toContain('notFound();');
      // The old unconditional-redirect pattern must be gone, not just
      // supplemented — a leftover unconditional redirect would silently
      // reintroduce the loop for the 403 case.
      expect(source).not.toMatch(/if\s*\(\s*!access\.ok\s*\)\s*redirect\(/);
    }
  });

  it('requireSquadInvitePermission itself supports the array form the read-access fix depends on', () => {
    const source = read('src/lib/require-squad-invite-permission.ts');
    expect(source).toContain('SquadInviteStaffPermission | SquadInviteStaffPermission[]');
    expect(source).toContain("in('permission',permissions)");
  });
});

describe('Squad Invite staff mutation endpoints — exact single-permission checks, unchanged/corrected', () => {
  it('start_review, request_changes and reject all require reviewer — not approver', () => {
    const source = read(REVIEW_ROUTE);
    expect(source).toMatch(/\[\s*'start_review'\s*,\s*'request_changes'\s*,\s*'reject'\s*\]\.includes\(action\?\?''\)\s*\?\s*'squad_invite_reviewer'\s*:\s*'squad_invite_approver'/);
  });

  it('approve requires approver', () => {
    expect(read(APPROVE_ROUTE)).toContain("requireSquadInvitePermission(auth, 'squad_invite_approver')");
  });

  it('cancel-approval requires approver', () => {
    expect(read(CANCEL_ROUTE)).toContain("requireSquadInvitePermission(createClient(),'squad_invite_approver')");
  });

  it('notification resend preparation requires approver', () => {
    expect(read(RESEND_ROUTE)).toContain("requireSquadInvitePermission(createClient(),'squad_invite_approver')");
  });

  it('no mutation endpoint was widened to accept an array of permissions — only the two read pages use OR access', () => {
    for (const route of [REVIEW_ROUTE, APPROVE_ROUTE, CANCEL_ROUTE, RESEND_ROUTE]) {
      expect(read(route)).not.toMatch(/requireSquadInvitePermission\([^)]*\[\s*'squad_invite_reviewer'/);
    }
  });
});

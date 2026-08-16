import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const PANEL = 'src/app/staff/squad-invites/StaffIdentityPanel.tsx';
const QUEUE_PAGE = 'src/app/staff/squad-invites/page.tsx';
const DETAIL_PAGE = 'src/app/staff/squad-invites/[reference]/page.tsx';
const REVIEW_ACTIONS = 'src/app/staff/squad-invites/[reference]/ReviewActions.tsx';
const HARNESS = 'src/app/dev/squad-invite-preview/staff-review-harness/StaffReviewHarness.tsx';
const EXPLANATIONS_LIB = 'src/lib/squad-invite-staff-action-explanations.ts';
const IDENTITY_LIB = 'src/lib/squad-invite-staff-identity.ts';

// Every file allowed to reference the staff-only identity panel — anything
// outside this set that imports it would mean a public, organiser or
// parent surface picked up staff email display, which must never happen.
const ALLOWED_IDENTITY_PANEL_FILES = new Set([PANEL, QUEUE_PAGE, DETAIL_PAGE, HARNESS]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

describe('Staff identity panel — shown only on authenticated Squad Invite staff pages', () => {
  it('the panel component names the three permission states the task specifies', () => {
    const source = read(PANEL);
    expect(source).toContain('Signed in as');
    expect(source).toContain('Reviewer');
    expect(source).toContain('Approver');
    expect(source).toContain('No Squad Invite permission');
  });

  it('both real staff pages render the identity panel only after the existing access gate resolves ok', () => {
    for (const page of [QUEUE_PAGE, DETAIL_PAGE]) {
      const source = read(page);
      const gateIndex = source.indexOf('if(!access.ok){');
      const panelIndex = source.indexOf('<StaffIdentityPanel');
      expect(gateIndex).toBeGreaterThan(-1);
      expect(panelIndex).toBeGreaterThan(gateIndex);
    }
  });

  it('the existing 401-vs-403 gate (login redirect vs notFound) is untouched by this change', () => {
    // Same assertion squad-invite-staff-authorization-contract.test.ts makes
    // — re-checked here because this task's own scope is the identity UI
    // built directly around that gate.
    for (const page of [QUEUE_PAGE, DETAIL_PAGE]) {
      const source = read(page);
      expect(source).toMatch(/if\s*\(\s*!access\.ok\s*\)\s*\{\s*if\s*\(\s*access\.status\s*===\s*401\s*\)\s*redirect\(/);
      expect(source).toContain('notFound();');
    }
  });

  it('the signed-in email comes only from the server-authenticated Supabase session, never a request body, URL or searchParams', () => {
    for (const page of [QUEUE_PAGE, DETAIL_PAGE]) {
      const source = read(page);
      expect(source).toContain('createClient().auth.getUser()');
      expect(source).toContain("const staffEmail=user?.email??''");
      // Guards against a future edit accidentally wiring the display email
      // to anything client-supplied instead.
      expect(source).not.toMatch(/staffEmail\s*=\s*(searchParams|params|request)/);
    }
  });

  it('the identity panel is never imported outside the staff pages, the panel itself, or the database-free staff harness', () => {
    const THIS_TEST_FILE = 'src/app/staff/squad-invites/staff-identity-panel-contract.test.ts';
    const offenders = walk('src/app').filter((file) => {
      if (ALLOWED_IDENTITY_PANEL_FILES.has(file) || file === THIS_TEST_FILE) return false;
      return read(file).includes('StaffIdentityPanel');
    });
    expect(offenders).toEqual([]);
  });

  it('no organiser, parent or public route reads staffEmail, staffPermissions or listSquadInviteStaffPermissions', () => {
    const staffOnlyFiles = new Set([QUEUE_PAGE, DETAIL_PAGE, REVIEW_ACTIONS, HARNESS, PANEL, IDENTITY_LIB, EXPLANATIONS_LIB]);
    const offenders = walk('src/app')
      .filter((file) => !staffOnlyFiles.has(file) && !file.includes('/staff/'))
      .filter((file) => /staffEmail|staffPermissions|listSquadInviteStaffPermissions/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe('Review actions — explanations replace the generic "Action unavailable" message', () => {
  it('ReviewActions no longer contains the old generic message', () => {
    expect(read(REVIEW_ACTIONS)).not.toContain('Action unavailable. Check permission, state and required reason.');
  });

  it('ReviewActions explains the action model (Reviewer vs Approver) in its own copy', () => {
    const source = read(REVIEW_ACTIONS);
    expect(source).toContain('Start review, Request changes and Reject');
    expect(source).toContain('Approve');
    expect(source).toContain('Reviewer permission does not imply Approver');
    expect(source).toContain('Approver permission does not imply Reviewer');
  });

  it('ReviewActions computes availability via explainSquadInviteAction rather than always rendering enabled buttons', () => {
    const source = read(REVIEW_ACTIONS);
    expect(source).toContain('explainSquadInviteAction');
    expect(source).toMatch(/disabled=\{!available\}/);
  });

  it('a disabled action button is associated with its explanation via aria-describedby, not silent styling alone', () => {
    const source = read(REVIEW_ACTIONS);
    expect(source).toMatch(/aria-describedby=\{available \? undefined : /);
  });

  it('on a failed request, the server error text is relayed rather than a hardcoded generic string', () => {
    const source = read(REVIEW_ACTIONS);
    expect(source).toMatch(/responseBody\?\.error\s*\|\|\s*explain\(action\)/);
  });

  it('does not weaken or replace server-side permission checks — the API paths called are unchanged', () => {
    const source = read(REVIEW_ACTIONS);
    expect(source).toContain('/api/staff/squad-invites/${requestId}/approve');
    expect(source).toContain('/api/staff/squad-invites/${requestId}/cancel-approval');
    expect(source).toContain('/api/staff/squad-invites/${requestId}/review');
    expect(source).toContain('/api/staff/squad-invites/${requestId}/notifications/${outboxId}/resend');
  });
});

describe('Staff review harness — extended to demonstrate the identity panel and explanations without touching Supabase', () => {
  it('imports no Supabase client (still database-free)', () => {
    expect(read(HARNESS)).not.toMatch(/@supabase|createServiceRoleClient|createClient\(/);
  });

  it('offers a synthetic identity for each of the four permission states, including none', () => {
    const source = read(HARNESS);
    expect(source).toContain("value=\"both\"");
    expect(source).toContain("value=\"reviewer\"");
    expect(source).toContain("value=\"approver\"");
    expect(source).toContain("value=\"none\"");
  });

  it('references no real production, staging or disposable project ref', () => {
    const source = read(HARNESS);
    for (const ref of ['cejruvmwruwjhgugbdgm', 'rqgrpaprfxxhcvqtwhgj', 'ksszgbcditlfimnfnzla']) {
      expect(source).not.toContain(ref);
    }
  });
});

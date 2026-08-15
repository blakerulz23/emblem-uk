import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const ORGANISER_PAGE = 'src/app/dev/squad-invite-preview/organiser-harness/page.tsx';
const ORGANISER_WRAPPER = 'src/app/dev/squad-invite-preview/organiser-harness/OrganiserFormHarness.tsx';
const STAFF_PAGE = 'src/app/dev/squad-invite-preview/staff-review-harness/page.tsx';
const STAFF_WRAPPER = 'src/app/dev/squad-invite-preview/staff-review-harness/StaffReviewHarness.tsx';
const HARNESS_FILES = [ORGANISER_PAGE, ORGANISER_WRAPPER, STAFF_PAGE, STAFF_WRAPPER];

// A prior chat turn walked through, then explicitly cancelled, a live
// Supabase branch delete/recreate for a disposable project — these three
// refs (production, parent staging, disposable branch) must never appear
// in code that ships, regardless of how that turn ended.
const KNOWN_PROJECT_REFS = ['cejruvmwruwjhgugbdgm', 'rqgrpaprfxxhcvqtwhgj', 'ksszgbcditlfimnfnzla'];

describe('database-free Squad Invite journey harnesses', () => {
  it('gates both routes behind the existing synthetic-preview flag and 404s outside development', () => {
    for (const page of [ORGANISER_PAGE, STAFF_PAGE]) {
      const source = read(page);
      expect(source).toContain("from '@/lib/squad-invite-preview-mode'");
      expect(source).toContain('isSyntheticSquadInvitePreviewEnabled');
      expect(source).toContain('if (!isSyntheticSquadInvitePreviewEnabled()) notFound();');
    }
  });

  it('imports no Supabase client anywhere in the harness files', () => {
    for (const file of HARNESS_FILES) {
      expect(read(file)).not.toMatch(/@supabase|createServiceRoleClient|createClient\(/);
    }
  });

  it('imports the real production components, not a copy', () => {
    expect(read(ORGANISER_WRAPPER)).toContain("import OrganiserStart from '@/app/squad-invite/start/OrganiserStart';");
    expect(read(STAFF_WRAPPER)).toContain("import ReviewActions from '@/app/staff/squad-invites/[reference]/ReviewActions';");
  });

  it('replicates, rather than imports, the Server Component queue/detail rendering', () => {
    // page.tsx and [reference]/page.tsx query Supabase inline in the
    // component body — there is no seam to inject synthetic data without
    // editing production source. The staff harness must not import them.
    const staff = read(STAFF_WRAPPER);
    expect(staff).not.toContain("from '@/app/staff/squad-invites/page'");
    expect(staff).not.toContain("from '@/app/staff/squad-invites/[reference]/page'");
    expect(staff).toContain('Player Queue → Squad Invites');
    expect(staff).toContain('Review Squad Invite');
  });

  it('never retains or forwards the original fetch to an unmocked request', () => {
    const organiser = read(ORGANISER_WRAPPER);
    expect(organiser).not.toMatch(/realFetch/);
    expect(organiser).toContain("return jsonResponse({ error: 'blocked in database-free harness' }, 403);");
    const staff = read(STAFF_WRAPPER);
    expect(staff).not.toMatch(/realFetch/);
    expect(staff).toContain("return new Response(JSON.stringify({ error: 'blocked in database-free harness' }), { status: 403 });");
  });

  it('blocks the real organiser submission endpoint, mocking only the three auth endpoints ahead of it', () => {
    const organiser = read(ORGANISER_WRAPPER);
    expect(organiser).not.toContain("/api/squad-invite-requests'");
    expect(organiser).not.toMatch(/path === ['"]\/api\/squad-invite-requests['"]/);
    for (const allowed of ['CONTEXT_PATH', 'REQUEST_CODE_PATH', 'VERIFY_CODE_PATH']) expect(organiser).toContain(allowed);
    expect(organiser.match(/if \(path === /g)).toHaveLength(3);
  });

  it('mocks exactly the two intended staff endpoints and nothing else', () => {
    const staff = read(STAFF_WRAPPER);
    expect(staff.match(/if \(path === /g)).toHaveLength(2);
    expect(staff).toContain('/review`');
    expect(staff).toContain('/approve`');
    // cancel-approval and notification resend are named only in the
    // explanatory comment above the boundary, never as a matched path —
    // both fall through to the same blocked-403 default as anything else.
    expect(staff).not.toMatch(/path === `[^`]*cancel-approval[^`]*`/);
    expect(staff).not.toMatch(/path === `[^`]*\/resend[^`]*`/);
  });

  it('contains no credential-shaped constants', () => {
    for (const file of HARNESS_FILES) {
      const source = read(file);
      expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWT-shaped
      expect(source).not.toMatch(/sb_secret|sb_publishable/);
      expect(source).not.toMatch(/postgresql:\/\//);
      expect(source).not.toMatch(/SUPABASE_[A-Z_]*KEY\s*[:=]\s*['"]/);
    }
  });

  it('references no real production, staging or disposable project ref', () => {
    for (const file of HARNESS_FILES) {
      const source = read(file);
      for (const ref of KNOWN_PROJECT_REFS) expect(source).not.toContain(ref);
    }
  });
});

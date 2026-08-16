import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const ORGANISER_START = 'src/app/squad-invite/start/OrganiserStart.tsx';
const VERIFY_ROUTE = 'src/app/api/squad-invite-organiser-auth/verify-code/route.ts';

describe('Organiser start — existing requests surfaced, new invites never blocked', () => {
  it('verify() routes to the existing-requests stage only when the server actually returned some', () => {
    const source = read(ORGANISER_START);
    expect(source).toMatch(/const existing=b\?\.existingRequests\?\?\[\];\s*if\s*\(existing\.length>0\)\s*\{setExistingRequests\(existing\);setStage\('existing'\);return;\}/);
    expect(source).toContain("setStage('details')");
  });

  it('a first-time organiser (empty existingRequests) still lands on the blank details form, unchanged', () => {
    // The fallthrough after the existing-requests check is the same
    // setStage('details') call that ran unconditionally before this
    // feature existed — first-time organisers see no new step at all.
    const source = read(ORGANISER_START);
    const verifyFn = source.match(/const verify=async\(\)=>\{[\s\S]*?\};/)?.[0] ?? '';
    expect(verifyFn.endsWith("setStage('details');};")).toBe(true);
  });

  it('existing requests are shown with a link to their own manage page, never inline progress detail', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('/squad-invite/manage/${r.publicReference}');
    expect(source).toContain('View request status');
  });

  it('starting a new Squad Invite is always available as an explicit, separate action — never blocked', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('Start a new Squad Invite for a different team');
    expect(source).toContain("onClick={()=>setStage('details')}");
  });

  it('the existing-requests lookup is additive — the security-hardened return-path contract is untouched', () => {
    // Same assertions squad-invite-mvp-contract.test.ts makes — re-checked
    // here because this feature's own edit landed directly next to them.
    const source = read(VERIFY_ROUTE);
    expect(source).toContain("returnTo:'/squad-invite/start'");
    expect(source).not.toContain('safeSquadInviteReturnPath');
    expect(source).not.toMatch(/body\?\.returnTo|body\.returnTo/);
  });

  it('the existing-requests query is scoped to the just-verified user via the service-role client, not left to RLS alone', () => {
    const source = read(VERIFY_ROUTE);
    expect(source).toContain("createServiceRoleClient().from('squad_invite_requests')");
    expect(source).toContain(".eq('organiser_profile_id',data.user.id)");
  });
});

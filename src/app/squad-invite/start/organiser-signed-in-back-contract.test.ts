import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const PAGE = 'src/app/squad-invite/start/page.tsx';
const ORGANISER_START = 'src/app/squad-invite/start/OrganiserStart.tsx';

// Guards the "Back to your Squad Invites" one-click fix: an organiser who
// already has a valid Supabase Auth session (e.g. arriving from the manage
// page's back link) must never be forced through email + OTP again just to
// see their own request list.
describe('Squad Invite start — an already-authenticated organiser skips straight past email/OTP', () => {
  it('the page checks for an existing session before ever rendering the email/OTP flow', () => {
    const source = read(PAGE);
    expect(source).toContain('await createClient().auth.getUser()');
    expect(source).toContain('if(!user) return <OrganiserStart/>;');
  });

  it('an authenticated organiser gets the same scoped, service-role existing-requests query the OTP-verify path uses', () => {
    const source = read(PAGE);
    expect(source).toContain("createServiceRoleClient().from('squad_invite_requests')");
    expect(source).toContain(".eq('organiser_profile_id',user.id)");
    expect(source).toContain("select('public_reference,club_team_name,request_status')");
  });

  it('passes the result to OrganiserStart as initialExistingRequests, in the same shape verify-code returns', () => {
    const source = read(PAGE);
    expect(source).toMatch(/initialExistingRequests=\{initialExistingRequests\}/);
    expect(source).toContain('publicReference:r.public_reference,teamName:r.club_team_name,status:r.request_status');
  });

  it('OrganiserStart distinguishes "no session" from "session but zero requests" — only the former starts at email', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain("initialExistingRequests===undefined?'email':initialExistingRequests.length>0?'existing':'details'");
  });

  it('a non-empty initial list seeds existingRequests directly, without waiting on a client fetch', () => {
    const source = read(ORGANISER_START);
    expect(source).toContain('useState<ExistingRequest[]>(initialExistingRequests??[])');
  });

  it('an unauthenticated visitor is completely unaffected — no prop, default stage stays email', () => {
    const source = read(PAGE);
    // The only unauthenticated branch returns the component with no props
    // at all, so OrganiserStart's own default parameter ({} default,
    // initialExistingRequests undefined) is what decides the stage —
    // never a value computed for a signed-out visitor.
    expect(source).toContain('if(!user) return <OrganiserStart/>;');
  });
});

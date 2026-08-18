import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/app/squad-invite/manage/[reference]/page.tsx');
const component = read('src/app/squad-invite/manage/[reference]/ReplaceInvitationLink.tsx');

describe('Organiser link-replacement UI contract', () => {
  it('page.tsx computes eligibility server-side with the same rule the endpoint enforces, only to decide whether to render the control', () => {
    expect(page).toContain("import { effectiveCampaignStatus, mayCompleteExistingBuilder, type CampaignStatus } from '@/lib/squad-invite'");
    expect(page).toContain('mayCompleteExistingBuilder(effectiveCampaignStatus(campaign.campaign_status,campaign.deadline_at))');
    expect(page).toContain('{linkReplacementEligible&&r.campaign_id&&<ReplaceInvitationLink campaignId={r.campaign_id}/>}');
  });

  it('never renders the control for a non-eligible or unowned campaign — gated on the same boolean, no separate always-on path', () => {
    expect(page.match(/<ReplaceInvitationLink/g)?.length).toBe(1);
    expect(page).toContain('linkReplacementEligible&&r.campaign_id&&<ReplaceInvitationLink');
  });

  it('requires an explicit confirmation step before calling the endpoint — no single-click rotation', () => {
    expect(component).toContain("setPhase('confirming')");
    expect(component).toContain('Yes, replace it');
    expect(component).toContain('Cancel');
    // The fetch call only happens from confirmReplace, which is only wired
    // to the confirmation-panel's own button, not the initial disclosure.
    const confirmingPanel = component.split("phase === 'confirming'")[1]?.split('phase === \'submitting\'')[0] ?? '';
    expect(confirmingPanel).toContain('onClick={confirmReplace}');
  });

  it('explains that the current link stops working immediately, both before and during confirmation', () => {
    expect(component).toMatch(/stops? the current link from working/);
    expect(component).toContain('immediately stop the current link from working');
  });

  it('guards against double submission with a ref, matching the established repo-wide pattern — not just disabled state', () => {
    expect(component).toContain('const submittingRef = useRef(false);');
    expect(component).toContain('if (submittingRef.current) return;');
    expect(component).toContain('submittingRef.current = true;');
  });

  it('disables the action while submitting and exposes accessible loading state', () => {
    expect(component).toContain("role=\"status\" aria-live=\"polite\" aria-busy=\"true\"");
    expect(component).toContain("phase === 'submitting'");
  });

  it('surfaces errors accessibly and distinctly for expired session, rate limit, ineligibility and generic failure', () => {
    expect(component).toContain('role="alert"');
    expect(component).toContain("response.status === 401");
    expect(component).toContain("response.status === 429");
    expect(component).toContain("response.status === 409");
    expect(component).toContain('Try again');
  });

  it('displays the new link exactly once, with a Copy button, and warns it cannot be recovered after leaving', () => {
    expect(component).toContain("phase === 'success'");
    expect(component).toContain('Copy link');
    expect(component).toContain('cannot be recovered after you leave this page');
    expect(component).toContain('navigator.clipboard.writeText(newLink)');
  });

  it('never persists the raw link to storage, a logger, or analytics — state only', () => {
    expect(component).not.toMatch(/localStorage\.|sessionStorage\./);
    expect(component).not.toMatch(/console\.(log|info|warn|error)/);
    expect(component).not.toMatch(/\.track\(|window\.analytics/);
  });

  it('documents the true cross-tab/network-retry idempotency limitation rather than claiming the client guard solves it', () => {
    expect(component).toMatch(/not,? and does not claim to be,? server-side idempotency|documented limitation/i);
    expect(component).toContain('a different tab or device');
  });
});

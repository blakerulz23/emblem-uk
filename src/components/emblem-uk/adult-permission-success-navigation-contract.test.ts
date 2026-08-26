import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const onConfirmedBlock = builder.match(/onConfirmed=\{\(\) => \{([\s\S]*?)\}\}\n\s*\/>/)?.[1] ?? '';

/**
 * Live re-verification of the timeout/atomic-state fixes found this
 * exact scenario still failing: a real declare + order-enquiry both
 * succeeded server-side (confirmed via Vercel logs — a genuine
 * "Emblem production request received" entry), yet the Adult Permission
 * screen just silently reset with no visible change at all. Root cause:
 * both success screens (the ordinary "Order received" panel and
 * GuardianPendingScreen) are gated on activeStepId === 'review', but
 * onConfirmed never advanced activeStepId away from 'adult-permission' —
 * so a fully successful submission had nowhere to render its own
 * outcome. This guards the fix directly against a regression, since
 * ProductionBuilder.tsx cannot be rendered in this repo's test
 * environment (no jsdom/testing-library — see fetch-with-timeout.test.ts
 * for why) and the actual transition can only be proven by reading the
 * source.
 */
describe('AdultPermissionStep onConfirmed — advances to the screen that can show the outcome', () => {
  it('exists and is non-empty (the match itself proves the callback shape did not change unexpectedly)', () => {
    expect(onConfirmedBlock.length).toBeGreaterThan(0);
  });

  it('sets activeStepId back to review before submitting — the only step that ever renders either success screen', () => {
    expect(onConfirmedBlock).toContain("setActiveStepId('review')");
  });

  it('sets activeStepId to review strictly before calling submitEnquiry, so the success screens are already reachable once the request settles', () => {
    const activeStepIdIndex = onConfirmedBlock.indexOf("setActiveStepId('review')");
    const submitEnquiryIndex = onConfirmedBlock.indexOf('submitEnquiry(');
    expect(activeStepIdIndex).toBeGreaterThanOrEqual(0);
    expect(submitEnquiryIndex).toBeGreaterThan(activeStepIdIndex);
  });

  it('still marks adultPermissionConfirmed so handleReviewFormSubmit does not bounce back to the permission step', () => {
    expect(onConfirmedBlock).toContain('setAdultPermissionConfirmed(true)');
  });

  it('both success screens this fix enables remain gated on activeStepId === \'review\' — proves the fix actually reaches them', () => {
    expect(builder).toContain("activeStepId === 'review' && !squadInviteContext && enquiryStatus === 'sent' && submittedAuthorityStatus === 'guardian_approval_pending'");
    expect(builder).toMatch(/activeStepId === 'review' && !squadInviteContext && !\(enquiryStatus === 'sent' && submittedAuthorityStatus === 'guardian_approval_pending'\)/);
  });
});

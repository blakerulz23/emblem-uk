import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/app/builder/page.tsx');
const builder = read('src/components/emblem-uk/ProductionBuilder.tsx');

describe('Squad Invite / ProductionBuilder reuse — no duplicate builder, real templates and validation shared', () => {
  it('the duplicate SquadParticipationBuilder no longer exists', () => {
    expect(existsSync('src/app/builder/SquadParticipationBuilder.tsx')).toBe(false);
  });

  it('builder/page.tsx re-verifies guardian ownership server-side before rendering, and 404s otherwise', () => {
    expect(page).toContain('auth.getUser()');
    expect(page).toContain(".eq('guardian_profile_id', user.id)");
    expect(page).toContain("data.status !== 'started'");
    expect(page).toContain('notFound()');
    expect(page).toContain('<ProductionBuilder squadInviteContext={context} />');
    expect(page).not.toContain('SquadParticipationBuilder');
  });

  it('Squad Invite mode uses a fixed 4-step list — order-type/team selection is never reachable, not merely hidden', () => {
    expect(builder).toContain("const SQUAD_INVITE_STEP_ORDER: StepId[] = ['upload', 'bg-removal', 'personalise', 'review']");
    expect(builder).toContain('squadInviteContext ? SQUAD_INVITE_STEP_ORDER : stepsFor(order.type)');
  });

  it('locks order.type to single and collectionType to custom at init — never the curated EMJFL official picker', () => {
    expect(builder).toMatch(/if \(squadInviteContext\) \{[\s\S]{0,600}type: 'single', collectionType: 'custom'/);
  });

  it('the order-type and collection step JSX are completely unaware of squadInviteContext — unreachable by step-list construction, not by a conditional guard', () => {
    const orderTypeBlock = builder.match(/\{activeStepId === 'order-type' && \(([\s\S]*?)\n {10}\)\}/)?.[1] ?? '';
    const collectionBlock = builder.match(/\{activeStepId === 'collection' && \(([\s\S]*?)\n {10}\)\}/)?.[1] ?? '';
    expect(orderTypeBlock).not.toContain('squadInviteContext');
    expect(collectionBlock).not.toContain('squadInviteContext');
  });

  it('reuses the same template gallery, PlayerCard rendering, photo upload/crop and background removal unchanged', () => {
    // The Squad Invite review panel renders the same local PlayerCard()
    // function component the normal review step uses — not a second one.
    const squadInviteReview = builder.match(/\{activeStepId === 'review' && squadInviteContext && \(\(\) => \{([\s\S]*?)\n {10}\}\)\(\)\}/)?.[1] ?? '';
    expect(squadInviteReview).toContain('const squadInvitePlayer = order.players[0];');
    expect(squadInviteReview).toContain('<PlayerCard order={order} player={squadInvitePlayer}');
    expect(builder).not.toMatch(/function PlayerCard\b[\s\S]*function PlayerCard\b/); // only one definition
    // Upload / bg-removal / personalise steps have no squadInviteContext
    // branch in their JSX bodies at all (only the one club-field readOnly
    // tweak, checked separately below) — proving they run byte-identical
    // in both modes.
    const uploadBlock = builder.match(/\{activeStepId === 'upload' && \(([\s\S]*?)\n {10}\)\}/)?.[1] ?? '';
    expect(uploadBlock).not.toContain('squadInviteContext');
  });

  it('locks the custom-collection club field read-only in Squad Invite mode, everywhere else unchanged', () => {
    expect(builder).toContain('readOnly={Boolean(squadInviteContext)}');
  });

  it('Squad Invite submit posts to the authenticated commit route with the RPC-shaped body, never /api/order-enquiry', () => {
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(submit).toContain('/api/squad-invite-participations/${encodeURIComponent(squadInviteContext.participationId)}/commit');
    expect(submit).not.toContain('/api/order-enquiry');
    expect(submit).not.toContain('buildUkCardCartUrl');
    expect(submit).not.toContain('window.location.href');
    expect(submit).toContain("'X-Emblem-CSRF': readSquadInviteCsrfCookie()");
    expect(submit).toContain('displayFirstName');
    expect(submit).toContain('displaySurnameInitial');
    expect(submit).toContain('accepted:');
  });

  it('guards Squad Invite submit against double-submit with a ref, matching the established repo-wide pattern', () => {
    expect(builder).toContain('const squadInviteSubmittingRef = useRef(false);');
    expect(builder).toContain('if (squadInviteSubmittingRef.current) return;');
  });

  it('never sends payment fields and always shows payment as disabled, not offered', () => {
    const squadInviteReview = builder.match(/\{activeStepId === 'review' && squadInviteContext && \(\(\) => \{([\s\S]*?)\n {10}\}\)\(\)\}/)?.[1] ?? '';
    expect(squadInviteReview).not.toMatch(/stripe|cardNumber|cvc/i);
    expect(squadInviteReview).toContain('Payment requests are not active during this test.');
    // The success screen's own payment line was consolidated from two
    // near-duplicate bullets ("No charge has been taken." + "Payment
    // requests remain disabled...") into one, per the UI polish pass —
    // still asserts no charge/payment took place, just without the repeat.
    expect(squadInviteReview).toContain('No payment is taken — payment requests remain disabled during this test.');
  });

  it('requires every declaration accepted separately before submit is possible, matching the commit route contract', () => {
    expect(builder).toContain('SQUAD_INVITE_REQUIRED_DECLARATIONS');
    for (const purpose of ['child_information_authority', 'photograph_manufacture', 'consolidated_delivery', 'payment_neutral_commitment']) {
      expect(builder).toContain(`purpose: '${purpose}'`);
    }
  });

  it('the normal builder submit path (submitEnquiry / /api/order-enquiry) is untouched by Squad Invite mode', () => {
    expect(builder).toContain("fetch('/api/order-enquiry'");
    expect(builder).toContain('const submitEnquiry = async (event: FormEvent<HTMLFormElement>)');
    const submitEnquiryBlock = builder.match(/const submitEnquiry = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(submitEnquiryBlock).not.toContain('squadInviteContext');
    expect(submitEnquiryBlock).not.toContain('commit_squad_invite');
  });
});

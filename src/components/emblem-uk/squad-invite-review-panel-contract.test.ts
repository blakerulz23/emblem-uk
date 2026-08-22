import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

function reviewBlock() {
  return builder.match(/\{activeStepId === 'review' && squadInviteContext && \(\(\) => \{([\s\S]*?)\n {10}\}\)\(\)\}/)?.[1] ?? '';
}

describe('Squad Invite final review/commit panel — polish contract', () => {
  it('renders the required heading, supporting copy and a scoped two-column desktop layout', () => {
    const review = reviewBlock();
    expect(review).toContain('Review and save your child&apos;s card');
    expect(review).toContain('This creates one private Squad Invite commitment for');
    expect(review).toContain('uk-squad-review-grid');
    expect(review).toContain('uk-squad-review-preview');
    expect(review).toContain('uk-squad-review-confirm');
    // Desktop widening/grid is scoped to this exact state only — never
    // applied to the normal wizard/normal review step.
    expect(builder).toContain("activeStepId === 'review' && squadInviteContext ? ' uk-wizard-phone--squad-review' : ''");
    expect(css).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?\.uk-wizard-phone--squad-review \{[\s\S]*?max-width: 960px;/);
    expect(css).toMatch(/\.uk-squad-review-grid \{[\s\S]*?display: grid;/);
  });

  it('renders a structured summary covering team, player, squad number, template, quantity, delivery and payment', () => {
    const review = reviewBlock();
    expect(review).toContain('uk-squad-review-summary');
    expect(review).toContain('<dt>Team</dt>');
    expect(review).toContain('<dt>Player</dt>');
    expect(review).toContain('<dt>Squad number</dt>');
    expect(review).toContain('<dt>Template</dt>');
    expect(review).toContain('<dt>Quantity</dt>');
    expect(review).toContain('<dt>Delivery</dt>');
    expect(review).toContain('<dt>Payment</dt>');
    // The displayed player name is derived the same way the real submit
    // payload derives displayFirstName/displaySurnameInitial — the summary
    // never shows more than what will actually be sent.
    expect(review).toMatch(/previewFirstName[\s\S]*previewSurnameInitial[\s\S]*previewDisplayName/);
  });

  it('shows the payment-required callout as a designed callout, not loose paragraph text, and states the real requirement', () => {
    const review = reviewBlock();
    expect(review).toContain('uk-squad-review-callout');
    expect(review).toContain("Payment is required once your team&apos;s price is confirmed.");
    expect(review).toContain("No card details are collected here — you&apos;ll be sent a separate payment request by email once your team&apos;s final price is confirmed.");
    expect(css).toMatch(/\.uk-squad-review-callout \{[\s\S]*?border: 2px solid var\(--wizard-accent\);/);
  });

  it('states aggregate-only organiser visibility in both the intro copy and the submit supporting text', () => {
    const review = reviewBlock();
    const matches = review.match(/organiser sees aggregate progress only, never these details/g) ?? [];
    expect(matches.length).toBe(2);
    expect(review).toContain("Your child&apos;s card joins the team&apos;s production queue now.");
    expect(review).toContain("card joins the team&apos;s production queue");
  });

  it('renders each of the four declarations as an independently-toggleable, full-width, properly labelled row', () => {
    const review = reviewBlock();
    expect(review).toContain('uk-squad-declaration-row');
    // Each row's onChange only ever touches its OWN purpose key — never a
    // batch/select-all handler — so the four are genuinely independent.
    expect(review).toContain('setSquadInviteAccepted((current) => ({ ...current, [declaration.purpose]: event.target.checked }))');
    expect(review).not.toMatch(/accepted:\s*true.*forEach|setSquadInviteAccepted\(\{\}\)/);
    // Real checkbox + associated <label htmlFor>, not a div-based fake control.
    expect(review).toMatch(/<label[^>]*htmlFor=\{`squad-invite-\$\{declaration\.purpose\}`\}/);
    expect(review).toContain('type="checkbox"');
    expect(css).toMatch(/\.uk-squad-declaration-row input\[type="checkbox"\] \{[\s\S]*?width: 22px;/);
    expect(css).toMatch(/\.uk-squad-declaration-row:focus-within \{[\s\S]*?outline: 2px solid var\(--wizard-accent\);/);
    expect(css).toContain('.uk-squad-declaration-row.is-checked {');
    expect(css).toContain('.uk-squad-declaration-row:hover {');
  });

  it('never pre-checks a declaration — initial state is empty', () => {
    expect(builder).toContain("const [squadInviteAccepted, setSquadInviteAccepted] = useState<Record<string, boolean>>({});");
  });

  it('validates declarations separately from name/photo completeness, tracks exactly which are missing, and focuses the first invalid one', () => {
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(submit).toContain('const missingDeclarations = SQUAD_INVITE_REQUIRED_DECLARATIONS.filter((declaration) => !squadInviteAccepted[declaration.purpose]);');
    expect(submit).toContain('if (missingDeclarations.length > 0) {');
    expect(submit).toContain('setSquadInviteDeclarationErrors(Object.fromEntries(missingDeclarations.map((declaration) => [declaration.purpose, true])));');
    expect(submit).toContain('squadInviteDeclarationRefs.current[missingDeclarations[0].purpose]?.focus();');
    // Declarations must be confirmed present before name/photo are even
    // checked — a missing declaration is reported and focused first, not
    // folded into one generic message.
    const declarationCheckIndex = submit.indexOf('missingDeclarations.length > 0');
    const nameCheckIndex = submit.indexOf('!firstName || !surnameInitial');
    expect(declarationCheckIndex).toBeGreaterThan(-1);
    expect(nameCheckIndex).toBeGreaterThan(declarationCheckIndex);
  });

  it('shows an accessible declaration error summary and per-row invalid state, wired together via aria-describedby', () => {
    const review = reviewBlock();
    expect(review).toContain('id="squad-invite-declarations-error"');
    expect(review).toContain("role=\"alert\"");
    expect(review).toContain('aria-invalid={invalid}');
    expect(review).toContain("aria-describedby={invalid ? 'squad-invite-declarations-error' : undefined}");
    expect(review).toContain("is-invalid");
  });

  it('clears a row-level error the moment that specific declaration is checked, without waiting for resubmission', () => {
    const review = reviewBlock();
    expect(review).toMatch(/if \(event\.target\.checked\) \{\s*setSquadInviteDeclarationErrors/);
  });

  it('final submit button is visually primary, correctly labelled, disabled and aria-busy while submitting, and double-submit is guarded by the existing ref', () => {
    const review = reviewBlock();
    expect(review).toContain('className="uk-wizard-primary uk-squad-review-submit"');
    expect(review).toContain('disabled={squadInviteSubmitting}');
    expect(review).toContain('aria-busy={squadInviteSubmitting}');
    expect(review).toContain('"Save my child\'s card"');
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(submit).toContain('if (squadInviteSubmittingRef.current) return;');
    expect(submit).toContain('squadInviteSubmittingRef.current = true;');
  });

  it('renders accessible loading/success/error states', () => {
    const review = reviewBlock();
    expect(review).toContain("role=\"status\" aria-live=\"polite\"");
    expect(review).toMatch(/role="alert" className="uk-enquiry-error"/);
    expect(review).toContain("'Saving…'");
  });

  it('preserves mobile bottom padding for the disposable notice and forbids horizontal overflow', () => {
    expect(css).toMatch(/\.uk-squad-review \{[\s\S]*?padding-bottom: 140px;/);
    expect(css).toContain('overflow-x: hidden;'); // inherited shell-level guard, confirmed still present
  });

  it('distinguishes a photo-upload HTTP failure from a genuine network failure, and never calls commit after either', () => {
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    // uploadOrderAsset throws a tagged error only for a real HTTP failure
    // (server reached, non-ok response) — a genuine fetch() rejection
    // (no connectivity) throws the browser's own native error instead, so
    // the two are told apart by type, not guessed at.
    expect(builder).toContain('class OrderAssetUploadHttpError extends Error {}');
    expect(builder).toContain('throw new OrderAssetUploadHttpError(result?.error ||');
    // The upload call has its own try/catch, distinct from the commit
    // fetch's try/catch — a failure there returns immediately and never
    // reaches the commit fetch below it.
    const uploadTryIndex = submit.search(/try \{\s*const asset = await uploadOrderAsset/);
    const uploadCatchIndex = submit.indexOf('} catch (uploadError) {');
    const commitFetchIndex = submit.indexOf("fetch(`/api/squad-invite-participations/");
    expect(uploadTryIndex).toBeGreaterThan(-1);
    expect(uploadCatchIndex).toBeGreaterThan(uploadTryIndex);
    expect(commitFetchIndex).toBeGreaterThan(uploadCatchIndex);
    const uploadCatchBlock = submit.slice(uploadCatchIndex, commitFetchIndex);
    expect(uploadCatchBlock).toContain("setSquadInviteOutcome(uploadError instanceof OrderAssetUploadHttpError ? 'photo_upload_failed' : 'network');");
    expect(uploadCatchBlock).toContain('return;');
  });

  it('a photo-upload HTTP failure is never labelled a network problem in the outcome type or the rendered copy', () => {
    expect(builder).toContain("type SquadInviteCommitOutcome = null | 'sign_in_required' | 'unavailable' | 'validation' | 'network' | 'photo_upload_failed';");
    const review = reviewBlock();
    expect(review).toContain("squadInviteOutcome === 'photo_upload_failed'");
    const photoFailureMessage = review.match(/squadInviteOutcome === 'photo_upload_failed' && \(\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(photoFailureMessage).not.toMatch(/network/i);
    expect(photoFailureMessage).toContain("photo couldn&apos;t be saved");
  });

  it('the commit request keeps its own try/catch — a genuine network failure there is still reported as network, and 401/400/other-non-ok are still handled by explicit status checks, not by catching a thrown error', () => {
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    const commitFetchIndex = submit.indexOf("fetch(`/api/squad-invite-participations/");
    const afterCommitFetch = submit.slice(commitFetchIndex);
    expect(afterCommitFetch).toMatch(/\} catch \{\s*setSquadInviteOutcome\('network'\);\s*return;\s*\}/);
    expect(afterCommitFetch).toContain("if (response.status === 401) { setSquadInviteOutcome('sign_in_required'); return; }");
    expect(afterCommitFetch).toContain("if (response.status === 400) { setSquadInviteOutcome('validation'); return; }");
    expect(afterCommitFetch).toContain("if (!response.ok) { setSquadInviteOutcome('unavailable'); return; }");
  });

  it('a failed submit attempt (either category) never clears the photo, personalise fields or declarations — state is preserved for retry', () => {
    const submit = builder.match(/const submitSquadInviteCommitment = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    // No call anywhere in the handler resets order/player/photo state or
    // the accepted-declarations map — every early return on failure simply
    // leaves existing component state untouched.
    expect(submit).not.toMatch(/patchPlayer\(|setOrder\(|setSquadInviteAccepted\(\{\}\)/);
  });

  it('the normal (non-Squad-Invite) review step and normal enquiry submit path are byte-unaware of any of the new classes/state', () => {
    const normalReview = builder.split("{activeStepId === 'review' && !squadInviteContext && (")[1]?.split('function SquadUploadQueue')[0] ?? '';
    for (const marker of ['uk-squad-review', 'uk-squad-declaration-row', 'squadInviteDeclarationErrors', 'squadInviteDeclarationRefs']) {
      expect(normalReview).not.toContain(marker);
    }
    const submitEnquiryBlock = builder.match(/const submitEnquiry = async[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(submitEnquiryBlock).not.toMatch(/squadInvite|uk-squad-review/);
  });
});

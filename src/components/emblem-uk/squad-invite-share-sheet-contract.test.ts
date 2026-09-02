import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { CARD_SHARE_LINK_URL, CARD_SHARE_MESSAGE_TEXT } from '@/lib/card-share';

const sheet = readFileSync('src/components/emblem-uk/SquadInviteShareSheet.tsx', 'utf8');

/**
 * SquadInviteShareSheet.tsx cannot be rendered in this repo's test
 * environment (no jsdom — see share-card-sheet-contract.test.ts's own top
 * comment). Its imported logic (eligibility/consent/state machine) is
 * already proven in card-share.test.ts and squad-invite-share-
 * authorization-contract.test.ts; this file proves the wiring specific to
 * this component: the primary-action presentation Phase 2 of the redesign
 * calls for, the caption-preview addition, and that every mandatory
 * product rule about caption content still holds for this new surface.
 */
describe('SquadInviteShareSheet — loading, trigger, and blocked states', () => {
  it('never shows the Share your card button before eligibility has resolved — loading is a distinct, neutral state', () => {
    const loadingIdx = sheet.indexOf('{loading &&');
    const buttonIdx = sheet.indexOf('{showShareButton &&');
    expect(loadingIdx).toBeGreaterThan(-1);
    expect(buttonIdx).toBeGreaterThan(loadingIdx);
    const loadingLine = sheet.slice(sheet.indexOf('const loading ='), sheet.indexOf(';', sheet.indexOf('const loading =')));
    expect(loadingLine).toContain('eligibility === null');
  });

  it('the primary button only renders once genuinely eligible, and never while the confirm/preparing/etc. flow is already open', () => {
    const idx = sheet.indexOf('const showShareButton');
    const line = sheet.slice(idx, sheet.indexOf(';', idx));
    expect(line).toContain('eligibility?.eligible');
    expect(line).toContain("stage.type === 'closed'");
  });

  it('an ineligible-and-hidden reason renders nothing at all — no button, no message', () => {
    const idx = sheet.indexOf('const showBlockedMessage');
    const line = sheet.slice(idx, sheet.indexOf(';', idx));
    expect(line).toContain('!shouldHideCardShareEntirely(eligibility!.reason)');
  });

  it('a nameable ineligible reason shows the existing safe blocked-state copy — never a sensitive/diagnostic reason, never any mention of payment', () => {
    expect(sheet).toContain('{showBlockedMessage && <p className="uk-squad-share-blocked">{blockedMessage}</p>}');
    expect(sheet).toContain('cardShareBlockedMessage(eligibility.reason)');
  });
});

describe('SquadInviteShareSheet — the confirm dialog matches the founder-specified copy exactly', () => {
  it('eyebrow, heading, warning, recall and confirmation label are present and reuse the shared card-share.ts constants — not a forked/duplicated copy of them', () => {
    expect(sheet).toContain('<span className="uk-card-share-eyebrow">Share your card</span>');
    expect(sheet).toContain("<h3>Share your child&apos;s card</h3>");
    expect(sheet).toContain('{CARD_SHARE_WARNING}');
    expect(sheet).toContain('{CARD_SHARE_RECALL_NOTICE}');
    expect(sheet).toContain('{CARD_SHARE_CONFIRMATION_LABEL}');
  });

  it('shows a caption preview before the guardian commits to sharing — the one addition beyond ShareCardSheet.tsx\'s own dialog, using the same fixed message text, never a new/duplicated string', () => {
    const idx = sheet.indexOf('uk-squad-share-caption-preview');
    expect(idx).toBeGreaterThan(-1);
    const section = sheet.slice(idx, idx + 200);
    expect(section).toContain('Caption preview');
    expect(section).toContain('{CARD_SHARE_MESSAGE_TEXT}');
  });

  it('the checkbox is driven by stage.checked and starts unticked — cardShareStageReducer\'s own "open" action sets checked:false, never true', () => {
    expect(sheet).toContain('checked={stage.checked}');
    expect(sheet).not.toContain('checked={true}');
    expect(sheet).not.toMatch(/checked:\s*true.*type:\s*['"]confirming['"]/);
  });

  it('the primary action is "Share now" and stays disabled until the checkbox is ticked', () => {
    const idx = sheet.indexOf('Share now');
    const section = sheet.slice(Math.max(0, idx - 200), idx);
    expect(section).toContain('disabled={!stage.checked}');
  });

  it('a Cancel action exists and records the cancellation via the shared recordCardShareConsent function — never silently discarded', () => {
    expect(sheet).toContain('onClick={handleCancel}');
    const idx = sheet.indexOf('const handleCancel');
    const body = sheet.slice(idx, sheet.indexOf('};', idx));
    expect(body).toContain("recordCardShareConsent(orderId, 'cancelled')");
  });
});

describe('SquadInviteShareSheet — consent before image, and every mandatory caption rule', () => {
  it('records consent before ever calling getShareImage — the same ordering ShareCardSheet.tsx already proves is required', () => {
    const consentIdx = sheet.indexOf('recordCardShareConsent(orderId');
    const getImageIdx = sheet.indexOf('getShareImage()');
    expect(consentIdx).toBeGreaterThan(-1);
    expect(getImageIdx).toBeGreaterThan(consentIdx);
  });

  it('a failed/ineligible consent response returns before getShareImage is ever called', () => {
    const consentIdx = sheet.indexOf('recordCardShareConsent(orderId');
    const failReturnIdx = sheet.indexOf('if (!consent.ok)');
    const getImageIdx = sheet.indexOf('getShareImage()');
    expect(failReturnIdx).toBeGreaterThan(consentIdx);
    expect(failReturnIdx).toBeLessThan(getImageIdx);
  });

  it('the generic preview constant (CARD_SHARE_MESSAGE_TEXT, shown only before the guardian has committed to sharing) points at this app\'s own domain — not emblem.cards, a different, unrelated product — and contains exactly one URL', () => {
    const urlMatches = CARD_SHARE_MESSAGE_TEXT.match(/https?:\/\//g) ?? [];
    expect(urlMatches).toHaveLength(1);
    expect(CARD_SHARE_MESSAGE_TEXT).toContain(CARD_SHARE_LINK_URL);
    expect(CARD_SHARE_LINK_URL).toBe('https://emblem-uk.vercel.app/builder');
    expect(CARD_SHARE_MESSAGE_TEXT).not.toMatch(/squadParticipation|participationId|orderId|submissionKey|cardId|SI-[A-Z0-9]/i);
  });

  it('the ACTUAL sent message is built server-side via createCardSharePublicPage + cardSharePublicPageUrl (migration 0085) — a genuine per-share token the client never invents, still never containing a participation id, order id, or child/team name', () => {
    expect(sheet).toContain('const publicPage = await createCardSharePublicPage(orderId, dataUrl);');
    expect(sheet).toContain('const messageText = buildCardShareMessageText(cardSharePublicPageUrl(publicPage.token));');
    expect(sheet).not.toMatch(/buildCardShareMessageText\([^)]*participationId/);
  });

  it('attempts navigator.share before the download fallback, passing the real per-share messageText only (never also url) — same anti-duplication fix ShareCardSheet.tsx already proves is required', () => {
    const shareIdx = sheet.indexOf('navigator.share(');
    const downloadIdx = sheet.indexOf('createObjectURL');
    expect(shareIdx).toBeGreaterThan(-1);
    expect(downloadIdx).toBeGreaterThan(shareIdx);
    const callBody = sheet.slice(shareIdx, sheet.indexOf('});', shareIdx));
    expect(callBody).toContain('text: messageText');
    expect(callBody).not.toContain('url:');
  });

  it('never offers a "Copy link" affordance, a public creation page, or any Doodles-style public-link copy', () => {
    expect(sheet).not.toMatch(/Copy link|Anyone with this link|Only you can purchase/i);
  });

  it('never persists the generated image anywhere beyond the in-flight fetch/blob conversion, and never creates a public /share/ page or signed URL', () => {
    expect(sheet).not.toMatch(/\/api\/order-assets|createServiceRoleClient|storage\.from|\/share\/|getSignedDownloadUrl|signedUrl/i);
  });

  it('cancelling the native share sheet (AbortError) resets rather than reporting success, and never copies to clipboard on that path', () => {
    const idx = sheet.indexOf("err.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 100);
    expect(section).toContain("dispatch({ type: 'reset' });");
    expect(section).not.toContain('navigator.clipboard');
  });

  it('a clipboard failure after a successful share is swallowed and never reported as a failed or cancelled share', () => {
    const shareCloseIdx = sheet.indexOf('});', sheet.indexOf('navigator.share('));
    const clipboardIdx = sheet.indexOf('navigator.clipboard.writeText(messageText)', shareCloseIdx);
    const localCatchIdx = sheet.indexOf('} catch {', clipboardIdx);
    const sharedDispatchIdx = sheet.indexOf("dispatch({ type: 'shared' })", shareCloseIdx);
    expect(localCatchIdx).toBeGreaterThan(clipboardIdx);
    expect(localCatchIdx).toBeLessThan(sharedDispatchIdx);
  });
});

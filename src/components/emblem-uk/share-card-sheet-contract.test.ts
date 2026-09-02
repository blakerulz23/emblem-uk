import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/components/emblem-uk/ShareCardSheet.tsx', 'utf8');
const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

/**
 * ShareCardSheet.tsx cannot be rendered in this repo's test environment (no
 * jsdom/testing-library — see fetch-with-timeout.test.ts for why). All of
 * its actual decision logic already lives in card-share.ts and is unit-
 * tested there directly. This guards the wiring itself: the order of
 * operations the product spec requires (consent before image generation,
 * cancel creates nothing, Web Share attempted before the download
 * fallback, object URLs released) can only be proven by reading the
 * source.
 */
describe('ShareCardSheet — consent is recorded before any image is generated', () => {
  it('handleContinue calls recordCardShareConsent before calling getShareImage', () => {
    const consentIdx = sheet.indexOf('recordCardShareConsent(orderId');
    const getImageIdx = sheet.indexOf('getShareImage()');
    expect(consentIdx).toBeGreaterThan(-1);
    expect(getImageIdx).toBeGreaterThan(-1);
    expect(getImageIdx).toBeGreaterThan(consentIdx);
  });

  it('a failed/ineligible consent response returns before getShareImage is ever called', () => {
    const consentIdx = sheet.indexOf('recordCardShareConsent(orderId');
    const failReturnIdx = sheet.indexOf('if (!consent.ok)');
    const getImageIdx = sheet.indexOf('getShareImage()');
    expect(failReturnIdx).toBeGreaterThan(consentIdx);
    expect(failReturnIdx).toBeLessThan(getImageIdx);
    expect(sheet.slice(failReturnIdx, getImageIdx)).toContain('return;');
  });
});

describe('ShareCardSheet — duplicate clicks do not create duplicate confirmed events', () => {
  it('handleContinue is guarded by a synchronous ref, not only the (stale-closure-prone) reducer state', () => {
    const idx = sheet.indexOf('const handleContinue');
    const fnStart = sheet.slice(idx, idx + 300);
    expect(fnStart).toContain('if (sharingRef.current) return;');
    expect(fnStart).toContain('sharingRef.current = true;');
  });

  it('the guard is released in a finally, so a completed or failed attempt always allows a genuine retry', () => {
    const idx = sheet.indexOf('const handleContinue');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).toContain('sharingRef.current = false;');
    const finallyIdx = fnBody.lastIndexOf('finally {');
    expect(fnBody.slice(finallyIdx)).toContain('sharingRef.current = false;');
  });
});

describe('ShareCardSheet — cancellation creates nothing', () => {
  it('handleCancel never calls getShareImage', () => {
    const cancelFnIdx = sheet.indexOf('const handleCancel');
    const nextFnIdx = sheet.indexOf('const handleContinue');
    const cancelBody = sheet.slice(cancelFnIdx, nextFnIdx);
    expect(cancelBody).not.toContain('getShareImage');
    expect(cancelBody).toContain("recordCardShareConsent(orderId, 'cancelled')");
  });
});

describe('ShareCardSheet — sharing mechanism order and cleanup', () => {
  it('attempts navigator.share (Web Share API with a File) before the download fallback', () => {
    const shareIdx = sheet.indexOf('navigator.share(');
    const downloadIdx = sheet.indexOf('createObjectURL');
    expect(shareIdx).toBeGreaterThan(-1);
    expect(downloadIdx).toBeGreaterThan(shareIdx);
  });

  it('checks navigator.canShare before calling navigator.share, and gates on File support specifically', () => {
    expect(sheet).toContain('navigator.canShare && navigator.canShare({ files: [file] })');
  });

  it('revokes the object URL immediately after triggering the download, via finally', () => {
    const createIdx = sheet.indexOf('URL.createObjectURL(blob)');
    const revokeIdx = sheet.indexOf('URL.revokeObjectURL(objectUrl)');
    const finallyIdx = sheet.indexOf('finally {', createIdx);
    expect(createIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(createIdx);
    expect(revokeIdx).toBeGreaterThan(finallyIdx);
  });

  it('never persists the generated image anywhere beyond the in-flight fetch/blob conversion (no fetch to an upload endpoint, no new storage call)', () => {
    expect(sheet).not.toMatch(/\/api\/order-assets|createServiceRoleClient|storage\.from/);
  });

  it('never creates a public /share/... page, a signed URL, or any recipient-specific link — the only URL ever shared is the fixed, generic builder link', () => {
    expect(sheet).not.toMatch(/\/share\/|getSignedDownloadUrl|signedUrl/i);
  });
});

/**
 * Web Share carries the fixed, generic message (never anything derived
 * from this order) alongside the file, and the download fallback surfaces
 * the identical wording so a guardian who falls back to a manual download
 * can still paste the same caption by hand.
 *
 * Regression coverage: manual WhatsApp Desktop testing on the previous
 * build (files + text + url all supplied together) showed the link twice
 * and the "Look what I made…" line missing entirely — WhatsApp composed
 * its own caption from `url` rather than reliably combining it with
 * `text`. CARD_SHARE_MESSAGE_TEXT already contains the link as ordinary
 * text, so the fix is to never also pass a separate `url` — one opaque
 * text block is the only thing every share target is guaranteed to show
 * verbatim.
 */
/**
 * Regression coverage for a live-reported diagnosability gap: a real
 * failure kept showing the exact same generic message regardless of
 * which of three genuinely different steps (capturing the image,
 * creating the public share link, or finishing the share/download) had
 * actually failed — impossible to tell apart from a screenshot alone.
 * Each stage now dispatches its own distinct wording.
 */
describe('ShareCardSheet — each failure stage has its own distinct message, so a report identifies which stage broke', () => {
  it('getShareImage() failing dispatches CARD_SHARE_CAPTURE_FAILURE, not the generic message', () => {
    const idx = sheet.indexOf('dataUrl = await getShareImage();');
    const catchIdx = sheet.indexOf('catch {', idx);
    const section = sheet.slice(catchIdx, sheet.indexOf('return;', catchIdx));
    expect(section).toContain('message: CARD_SHARE_CAPTURE_FAILURE');
    expect(section).not.toContain('CARD_SHARE_GENERIC_FAILURE');
  });

  it('createCardSharePublicPage failing without its own server-provided error dispatches CARD_SHARE_LINK_FAILURE, not the generic message', () => {
    const idx = sheet.indexOf('const publicPage = await createCardSharePublicPage');
    const section = sheet.slice(idx, sheet.indexOf('return;', idx));
    expect(section).toContain('publicPage.error || CARD_SHARE_LINK_FAILURE');
    expect(section).not.toContain('CARD_SHARE_GENERIC_FAILURE');
  });

  it('a server-provided error from createCardSharePublicPage is still shown verbatim, never overridden by the generic fallback', () => {
    const idx = sheet.indexOf('const publicPage = await createCardSharePublicPage');
    const section = sheet.slice(idx, sheet.indexOf('return;', idx));
    expect(section).toMatch(/message:\s*publicPage\.error\s*\|\|/);
  });
});

describe('ShareCardSheet — the shared text carries the real per-share link (migration 0085), appears exactly once, and is never derived from a client-supplied value', () => {
  it('navigator.share is called with the file and messageText only — never also a separate url (which caused the reported duplication)', () => {
    const idx = sheet.indexOf('navigator.share({');
    const callBody = sheet.slice(idx, sheet.indexOf('});', idx));
    expect(callBody).toContain('files: [file]');
    expect(callBody).toContain('text: messageText');
    expect(callBody).not.toContain('url:');
    expect(callBody).not.toContain('orderId');
  });

  it('messageText is built server-side from a genuine public-page token (createCardSharePublicPage), never a template literal or concatenation the client controls', () => {
    expect(sheet).toContain('const publicPage = await createCardSharePublicPage(orderId, dataUrl);');
    expect(sheet).toContain('const messageText = buildCardShareMessageText(cardSharePublicPageUrl(publicPage.token));');
    const idx = sheet.indexOf('navigator.share({');
    const callBody = sheet.slice(idx, sheet.indexOf('});', idx));
    expect(callBody).not.toMatch(/text:\s*`|text:\s*"/);
  });

  it('an ineligible/failed public-page creation fails the whole share attempt before ever calling navigator.share or getShareImage a second time', () => {
    const createIdx = sheet.indexOf('createCardSharePublicPage(orderId, dataUrl)');
    const failIdx = sheet.indexOf("if (!publicPage.ok || !publicPage.token)");
    const shareIdx = sheet.indexOf('navigator.share({');
    expect(createIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeGreaterThan(createIdx);
    expect(failIdx).toBeLessThan(shareIdx);
  });

  it('the attached file is still the exact generated image — the message fix never touches what is attached', () => {
    const idx = sheet.indexOf('navigator.share({');
    const callBody = sheet.slice(idx, sheet.indexOf('});', idx));
    expect(callBody).toMatch(/files:\s*\[file\]/);
  });

  it('the downloaded-status view displays the real per-share message (shareMessageText), not the generic preview constant', () => {
    const idx = sheet.indexOf("stage.type === 'downloaded'");
    const section = sheet.slice(idx, idx + 350);
    expect(section).toContain('{shareMessageText}');
  });

  it('the downloaded-status view also offers a copy control for that same wording', () => {
    const idx = sheet.indexOf("stage.type === 'downloaded'");
    const section = sheet.slice(idx, idx + 350);
    expect(section).toContain('onClick={handleCopyMessage}');
    const copyFnIdx = sheet.indexOf('const handleCopyMessage');
    const copyFnBody = sheet.slice(copyFnIdx, sheet.indexOf('\n  };', copyFnIdx));
    expect(copyFnBody).toContain('navigator.clipboard.writeText(shareMessageText || CARD_SHARE_MESSAGE_TEXT)');
  });
});

/**
 * The Web Share API gives calling code no way to learn whether the target
 * app actually displayed `text` — only whether the whole call resolved or
 * rejected. Manual testing found WhatsApp Desktop specifically drops the
 * caption while still accepting the file. Since this can't be detected,
 * the honest fix is to never confidently claim the message was included:
 * a defensive clipboard copy happens after every successful native share
 * too (not just the download fallback), and the visible copy afterwards
 * is worded as a possibility, not a certainty.
 */
describe('ShareCardSheet — honest handling of a platform that may silently drop the caption', () => {
  it('after a successful navigator.share, the message is also copied to the clipboard defensively, before reporting success', () => {
    const shareIdx = sheet.indexOf('navigator.share({');
    const shareCloseIdx = sheet.indexOf('});', shareIdx);
    const sharedDispatchIdx = sheet.indexOf("dispatch({ type: 'shared' })", shareCloseIdx);
    const clipboardIdx = sheet.indexOf('navigator.clipboard.writeText(messageText)', shareCloseIdx);
    expect(clipboardIdx).toBeGreaterThan(shareCloseIdx);
    expect(sharedDispatchIdx).toBeGreaterThan(clipboardIdx);
  });

  it('a clipboard failure after a successful share is swallowed locally and never reported as a failed/cancelled share', () => {
    const shareIdx = sheet.indexOf('navigator.share({');
    const shareCloseIdx = sheet.indexOf('});', shareIdx);
    const clipboardIdx = sheet.indexOf('navigator.clipboard.writeText(messageText)', shareCloseIdx);
    const localCatchIdx = sheet.indexOf('} catch {', clipboardIdx);
    const sharedDispatchIdx = sheet.indexOf("dispatch({ type: 'shared' })", shareCloseIdx);
    expect(localCatchIdx).toBeGreaterThan(clipboardIdx);
    expect(localCatchIdx).toBeLessThan(sharedDispatchIdx);
  });

  it('the "shared" success state never asserts the message definitely arrived — it names the real possibility that it didn\'t', () => {
    const idx = sheet.indexOf("stage.type === 'shared'");
    const section = sheet.slice(idx, idx + 500);
    expect(section).toMatch(/didn.t appear|may not have|if the message/i);
    expect(section).not.toBe("<p role=\"status\">Shared. {CARD_SHARE_RECALL_NOTICE}</p>");
  });

  it('the "shared" state offers the identical copy-message affordance as the download fallback, for a consistent experience either way', () => {
    const sharedIdx = sheet.indexOf("stage.type === 'shared'");
    const sharedSection = sheet.slice(sharedIdx, sheet.indexOf("stage.type === 'downloaded'", sharedIdx));
    expect(sharedSection).toContain('{shareMessageText}');
    expect(sharedSection).toContain('onClick={handleCopyMessage}');
    expect(sharedSection).toContain('uk-card-share-download-message');
  });

  it('cancelling the native share sheet is still never reported as shared, and no clipboard copy happens on that path', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 100);
    expect(section).toContain("dispatch({ type: 'reset' });");
    expect(section).not.toContain('navigator.clipboard');
  });

  it('cancelling the native share sheet is never reported as a successful share, and records no confirmed consent (only handleCancel/handleContinue can record "confirmed", and neither runs on cancel)', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 100);
    expect(section).toContain("dispatch({ type: 'reset' });");
    expect(section).not.toContain("dispatch({ type: 'shared' })");
    expect(section).not.toContain("recordCardShareConsent(orderId, 'confirmed')");
  });
});

/**
 * Regression coverage for a live-preview-confirmed defect: adding the
 * public-page upload step (migration 0085) before navigator.share()
 * inserts a real network round-trip between the guardian's tap and the
 * share call — long enough, on iOS Safari specifically, that the
 * browser's Web Share "user activation" window can expire before
 * share() is even invoked. That produces a rejection that is NOT an
 * AbortError, and the previous code treated every non-abort rejection as
 * a hard failure — so a guardian who hit this got "We could not prepare
 * this image right now" with a perfectly good image already sitting in
 * memory. The fix: navigator.share() gets its own try/catch: an
 * AbortError still resets silently, but any OTHER rejection falls
 * through to the same download fallback already used when Web Share
 * isn't supported at all, rather than failing the whole attempt.
 */
/**
 * Regression coverage for a live-confirmed layout defect, in two stages.
 * Every CardArt sub-renderer (CustomCollectionCardArt, EmjflCardArt, etc.)
 * sets its own root div's width/height/border-radius/font-size/padding as
 * fixed INLINE PIXEL values computed in JS from the `size` prop (340 for
 * a non-compact PlayerCard) — never percentages, never fluid. An initial
 * fix added `overflow: hidden` to contain the bleed, which stopped the
 * whole page from scrolling horizontally but only CLIPPED the oversized
 * card rather than making it fit — reported live as still overflowing.
 * The actual fix scales the fixed-pixel subtree down with CSS
 * `transform: scale()`, driven by a CSS container query (100cqw) so the
 * ratio recomputes continuously at any viewport width, not just a fixed
 * breakpoint — the standard technique for shrinking an element whose
 * internal layout can't be safely made fluid via width overrides alone
 * (font-size/border-radius/padding here are independent fixed pixel
 * values, not percentages, so they would NOT rescale from a plain
 * width/height CSS override).
 */
describe('ShareCardSheet — the card preview genuinely scales to fit on narrow viewports, not merely clipped', () => {
  it('.uk-card-share-preview keeps overflow: hidden as a safety net only, not the fix itself', () => {
    const idx = css.indexOf('.uk-card-share-preview {');
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('overflow: hidden');
  });

  it('.uk-real-card establishes a container query context and reserves a correctly-proportioned box, independent of its transformed child\'s own layout size', () => {
    const idx = css.indexOf('.uk-card-share-preview .uk-real-card {');
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('container-type: inline-size');
    expect(rule).toContain('aspect-ratio: 340 / 476');
    expect(rule).toContain('width: min(280px, 100%)');
  });

  it('constrains the implicit grid column so the generic .uk-real-card{display:grid} rule can\'t size the track to the child\'s un-transformed 340px width — confirmed live via a real browser measurement that omitting this shifts the (still correctly-scaled) card 32px off-centre, not merely un-centred by a few pixels', () => {
    const idx = css.indexOf('.uk-card-share-preview .uk-real-card {');
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('CardArt\'s own fixed-340px root (.uk-real-card\'s direct child) is visually scaled via a container-query-driven transform, not a width override', () => {
    const idx = css.indexOf('.uk-card-share-preview .uk-real-card > div {');
    expect(idx).toBeGreaterThan(-1);
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('transform: scale(calc(100cqw / 340px))');
    expect(rule).toContain('transform-origin: top left');
  });
});

describe('ShareCardSheet — a non-cancel navigator.share() failure falls back to download, never a hard failure', () => {
  it('navigator.share is wrapped in its own try/catch, nested inside the outer blob/download try — not sharing the outer catch directly', () => {
    const shareIdx = sheet.indexOf('navigator.share({');
    const innerTryIdx = sheet.lastIndexOf('try {', shareIdx);
    const outerTryIdx = sheet.lastIndexOf('try {', innerTryIdx - 1);
    expect(innerTryIdx).toBeGreaterThan(-1);
    expect(outerTryIdx).toBeGreaterThan(-1);
    expect(outerTryIdx).toBeLessThan(innerTryIdx);
  });

  it('a non-AbortError rejection from navigator.share has no early return, and no fail dispatch of its own — it falls through to the code below', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const abortBlockEnd = sheet.indexOf('}', sheet.indexOf('return;', idx));
    const catchBlockEnd = sheet.indexOf('}\n        }', abortBlockEnd);
    const fallthroughSection = sheet.slice(abortBlockEnd, catchBlockEnd + 20);
    expect(fallthroughSection).not.toContain("dispatch({ type: 'fail'");
    expect(fallthroughSection).not.toContain('return;');
  });

  it('the code that actually performs the download (createObjectURL) sits after the navigator.share try/catch closes, still reachable on a share failure', () => {
    const shareTryCatchIdx = sheet.indexOf("shareErr.name === 'AbortError'");
    const downloadIdx = sheet.indexOf('URL.createObjectURL(blob)', shareTryCatchIdx);
    expect(downloadIdx).toBeGreaterThan(shareTryCatchIdx);
  });

  it('the outer catch (blob/download failures only, now that share failures are handled separately) no longer inspects err.name at all', () => {
    const outerCatchIdx = sheet.lastIndexOf('} catch {');
    expect(outerCatchIdx).toBeGreaterThan(-1);
    const section = sheet.slice(outerCatchIdx, outerCatchIdx + 400);
    expect(section).not.toContain('AbortError');
    expect(section).toContain("dispatch({ type: 'fail', message: CARD_SHARE_GENERIC_FAILURE });");
  });
});

describe('ShareCardSheet — visibility gating', () => {
  it('the design preview is never gated on eligibility — only the share control and any blocked message are', () => {
    // No early `return null` exists anywhere before the component's own
    // final JSX return — the preview (and rotate control) must render
    // regardless of whether eligibility has resolved yet, or resolved to
    // an ineligible/hidden reason. Only showShareIcon/showBlockedMessage
    // gate what appears ON TOP of that preview.
    const returnIdx = sheet.indexOf('return (');
    const bodyBeforeReturn = sheet.slice(0, returnIdx);
    expect(bodyBeforeReturn).not.toMatch(/return null;/);
  });

  it('never shows the share icon before eligibility resolves', () => {
    const idx = sheet.indexOf('const showShareIcon');
    const line = sheet.slice(idx, sheet.indexOf(';', idx));
    expect(line).toContain('eligibility?.eligible');
  });

  it('hides entirely (no message at all) for reasons shouldHideCardShareEntirely marks as such', () => {
    const idx = sheet.indexOf('const showBlockedMessage');
    const line = sheet.slice(idx, sheet.indexOf(';', idx));
    expect(line).toContain('!shouldHideCardShareEntirely(eligibility!.reason)');
  });

  it('the confirmation sheet never pre-ticks the checkbox — opening always starts unticked (cardShareStageReducer\'s own "open" case)', () => {
    expect(sheet).toContain("checked={stage.checked}");
    expect(sheet).not.toContain('checked={true}');
  });
});

/**
 * Card-preview redesign (inspired by the supplied reference): the real
 * on-screen card front, rotate and share controls, and a small textual
 * order summary all live in one frame inside "Your order" now — there is
 * exactly one sharing entry point on the page (see the ProductionBuilder
 * describe block below for proof the old standalone panel is gone).
 */
describe('ShareCardSheet — rotate control and order summary', () => {
  it('renders a rotate control, always (never gated on eligibility, unlike the share icon)', () => {
    const idx = sheet.indexOf('uk-card-share-icon-btn rotate');
    expect(idx).toBeGreaterThan(-1);
    // Must not be inside a showShareIcon-guarded block.
    const precedingShowShareIconIdx = sheet.lastIndexOf('{showShareIcon &&', idx);
    expect(precedingShowShareIconIdx === -1 || precedingShowShareIconIdx > idx).toBe(true);
  });

  it('rotate has a descriptive aria-label distinct from the share control\'s', () => {
    expect(sheet).toContain('aria-label="Rotate card preview"');
    expect(sheet).toContain('aria-label="Share your card design"');
  });

  it('rotating only changes a local, cosmetic rotation value applied to the preview wrapper — never the underlying preview element, order, or capture inputs', () => {
    const idx = sheet.indexOf('const [rotation, setRotation]');
    expect(idx).toBeGreaterThan(-1);
    const onClickIdx = sheet.indexOf('setRotation((current) => (current + 90) % 360)');
    expect(onClickIdx).toBeGreaterThan(-1);
    // The rotation transform is applied to a wrapper div, not to `preview`
    // itself, and the wrapper never appears inside getShareImage/capture code.
    expect(sheet).toContain('className="uk-card-share-preview-card" style={{ transform: `rotate(${rotation}deg)` }}');
  });

  it('the share icon button and the rotate button are positioned as siblings of the rotating wrapper, not inside it — so they never rotate with the card', () => {
    const wrapperIdx = sheet.indexOf('uk-card-share-preview-card');
    const wrapperCloseIdx = sheet.indexOf('</div>', wrapperIdx);
    const rotateBtnIdx = sheet.indexOf('uk-card-share-icon-btn rotate');
    expect(rotateBtnIdx).toBeGreaterThan(wrapperCloseIdx);
  });

  it('displays the collection name, player count and print count from the summary prop — never a hidden/private field', () => {
    const idx = sheet.indexOf('uk-card-share-summary');
    const section = sheet.slice(idx, idx + 300);
    expect(section).toContain('{collectionName}');
    expect(section).toContain('{playerCount}');
    expect(section).toContain('{printCount}');
  });

  it('the summary prop type carries only collection name and two counts — nothing that could be a private field', () => {
    expect(sheet).toContain('summary: { collectionName: string; playerCount: number; printCount: number };');
  });
});

/**
 * Visual redesign: the design is shown on screen (the same PlayerCard
 * ProductionBuilder already renders elsewhere, handed in as `preview` — see
 * this component's own top comment on why it stays a plain ReactNode
 * rather than an import of card-definition.tsx), with the share affordance
 * placed directly on it, and the confirmation step is a focused overlay
 * rather than an inline block. None of this changes the underlying
 * eligibility/consent/capture logic already covered above and in
 * card-share.ts — only where and how the same states are presented.
 */
describe('ShareCardSheet — the design preview and its share affordance', () => {
  it('renders the caller-supplied preview inside the same box the share icon sits on', () => {
    const previewIdx = sheet.indexOf('<div className="uk-card-share-preview">');
    const braceIdx = sheet.indexOf('{preview}', previewIdx);
    const iconBtnIdx = sheet.indexOf('uk-card-share-icon-btn', previewIdx);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(braceIdx).toBeGreaterThan(previewIdx);
    expect(iconBtnIdx).toBeGreaterThan(braceIdx);
  });

  it('the share icon button only appears once eligible and while nothing else is already in progress', () => {
    const idx = sheet.indexOf('uk-card-share-icon-btn share');
    const guardSection = sheet.slice(Math.max(0, idx - 200), idx);
    expect(guardSection).toContain('{showShareIcon && (');
    const showShareIconIdx = sheet.indexOf('const showShareIcon');
    const showShareIconLine = sheet.slice(showShareIconIdx, sheet.indexOf(';', showShareIconIdx));
    expect(showShareIconLine).toContain("stage.type === 'closed'");
  });

  it('the icon button has an accessible name (icon-only, no visible label text)', () => {
    expect(sheet).toContain('aria-label="Share your card design"');
  });

  it('the confirmation step renders as a dismissible overlay, and the backdrop click cancels the same way the Cancel button does', () => {
    const idx = sheet.indexOf('uk-card-share-modal-backdrop');
    const section = sheet.slice(idx, idx + 400);
    expect(section).toContain('onClick={handleCancel}');
    expect(section).toContain('onClick={(event) => event.stopPropagation()}');
  });

  it('Escape closes the overlay the same safe way Cancel does (never a silent close that skips recording cancellation)', () => {
    const idx = sheet.indexOf("if (event.key === 'Escape')");
    expect(idx).toBeGreaterThan(-1);
    const section = sheet.slice(idx, idx + 60);
    expect(section).toContain('handleCancel();');
  });

  it('moves focus into the overlay when it opens, and keeps Tab cycling within its own three controls only', () => {
    const idx = sheet.indexOf('if (stage.type !== \'confirming\') return;');
    const fnBody = sheet.slice(idx, sheet.indexOf('}, [stage.type]);', idx));
    expect(fnBody).toContain('.focus();');
    expect(fnBody).toContain("event.key !== 'Tab'");
    expect(fnBody).toContain('event.preventDefault();');
  });

  it('actually attaches dialogRef to the dialog element the focus/Tab logic reads from (a ref declared but never attached would silently no-op)', () => {
    const refIdx = sheet.indexOf('ref={dialogRef}');
    expect(refIdx).toBeGreaterThan(-1);
    const classNameIdx = sheet.indexOf('className="uk-card-share-modal"', refIdx);
    expect(classNameIdx).toBeGreaterThan(refIdx);
    expect(classNameIdx - refIdx).toBeLessThan(60);
  });

  it('still records the same consent version/warning/recall copy inside the redesigned overlay — the redesign never touches what is disclosed or agreed to', () => {
    const idx = sheet.indexOf('uk-card-share-modal"');
    const fnBody = sheet.slice(idx, sheet.indexOf('</div>\n      )}', idx));
    expect(fnBody).toContain('{CARD_SHARE_WARNING}');
    expect(fnBody).toContain('{CARD_SHARE_RECALL_NOTICE}');
    expect(fnBody).toContain('{CARD_SHARE_CONFIRMATION_LABEL}');
  });
});

describe('ProductionBuilder — ShareCardSheet is only mounted for a single-child, directly-confirmed order, inside "Your order"', () => {
  it('gates the whole card-preview experience on enquiryStatus sent, authority confirmed, and order.type single, independent of the server\'s own re-check', () => {
    const idx = builder.indexOf('const shareableOrderContext =');
    expect(idx).toBeGreaterThan(-1);
    const gateBody = builder.slice(idx, builder.indexOf(';', builder.indexOf('null;', idx)));
    expect(gateBody).toContain("enquiryStatus === 'sent'");
    expect(gateBody).toContain("submittedAuthorityStatus === 'confirmed'");
    expect(gateBody).toContain("order.type === 'single'");
    expect(gateBody).toContain('submittedOrderId');
    expect(gateBody).toContain('soleApprovedPlayer');
  });

  it('renders ShareCardSheet inside "Your order" (uk-order-club-list) in place of the ordinary club/badge row when the gate is true', () => {
    const orderListIdx = builder.indexOf('<div className="uk-order-club-list">');
    const yourOrderHeadingIdx = builder.indexOf('<h3>Your order</h3>', orderListIdx);
    const conditionalIdx = builder.indexOf('shareableOrderContext ?', yourOrderHeadingIdx);
    const shareCardSheetIdx = builder.indexOf('<ShareCardSheet', yourOrderHeadingIdx);
    expect(yourOrderHeadingIdx).toBeGreaterThan(orderListIdx);
    expect(conditionalIdx).toBeGreaterThan(yourOrderHeadingIdx);
    expect(shareCardSheetIdx).toBeGreaterThan(conditionalIdx);
    // And it is the ONLY place ShareCardSheet is rendered anywhere in this file.
    const secondOccurrence = builder.indexOf('<ShareCardSheet', shareCardSheetIdx + 1);
    expect(secondOccurrence).toBe(-1);
  });

  it('there is no separate standalone sharing panel anywhere else on the page (the old "Order summary" handoff box has no sharing content after it)', () => {
    const handoffIdx = builder.indexOf('<div className="uk-handoff-box">');
    const afterHandoff = builder.slice(handoffIdx, handoffIdx + 600);
    expect(afterHandoff).not.toContain('ShareCardSheet');
    expect(afterHandoff).not.toContain('captureShareImage');
  });

  it('passes the real, visible, on-screen PlayerCard as the preview, the real order id, and the real collection/player/print summary — never the off-screen capture rig\'s player', () => {
    const idx = builder.indexOf('<ShareCardSheet');
    const tagSection = builder.slice(idx, idx + 500);
    expect(tagSection).toContain('orderId={shareableOrderContext.orderId}');
    expect(tagSection).toContain('preview={<PlayerCard order={order} player={shareableOrderContext.player} side="front" />}');
    expect(tagSection).toContain("collectionName: order.collectionName || 'Custom Collection'");
    expect(tagSection).toContain('playerCount: summary.approvedPlayers.length');
    expect(tagSection).toContain('printCount: summary.approvedPrints');
  });

  it('the off-screen capture rig that actually produces the shared image contains only the PlayerCard — never the rotate/share buttons or any other on-screen control', () => {
    const idx = builder.indexOf('{shareCapturePlayer && (');
    const rigBody = builder.slice(idx, builder.indexOf('\n      )}', idx));
    expect(rigBody).toContain('<PlayerCard order={order} player={shareCapturePlayer} side="front" />');
    expect(rigBody).not.toContain('uk-card-share-icon-btn');
    expect(rigBody).not.toContain('<button');
    expect(rigBody).not.toContain('rotation');
  });

  it('the share capture rig is a separate off-screen tree from the print capture rig, sharing no state with it', () => {
    expect(builder).toContain('const [shareCapturePlayer, setShareCapturePlayer] = useState<PlayerDraft | null>(null);');
    expect(builder).toContain('const shareCaptureRef = useRef<HTMLDivElement | null>(null);');
    expect(builder).not.toMatch(/captureMode\s*&&\s*shareCapturePlayer|shareCapturePlayer\s*&&\s*captureMode/);
  });

  it('captureShareImageFor never calls renderPrintFile — only the plain (mark-free) captureElementToPng', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('captureElementToPng(el');
    expect(fnBody).not.toContain('renderPrintFile');
  });

  it('captureShareImageFor uses a lower pixelRatio than the print pipeline\'s own pixelRatio: 3', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('pixelRatio: 2');
  });

  it('captureShareImage (the ordinary builder\'s own call site) is an unchanged-behaviour wrapper: same order id, same sole approved player', () => {
    expect(builder).toContain('const captureShareImage = (): Promise<string> => captureShareImageFor(submittedOrderId, summary.approvedPlayers[0]);');
  });

  it('captureSquadInviteShareImage passes the Squad Invite order id and player — never the ordinary builder\'s submittedOrderId/approvedPlayers, which are unrelated to a Squad Invite commitment', () => {
    const idx = builder.indexOf('const captureSquadInviteShareImage');
    const line = builder.slice(idx, builder.indexOf(';', idx));
    expect(line).toContain('captureShareImageFor(squadInviteOrderId, order.players[0])');
    expect(line).not.toContain('submittedOrderId');
    expect(line).not.toContain('approvedPlayers');
  });
});

/**
 * Regression coverage for the live-preview-verified defect: the shared
 * image reproduced the card design and badge but not the player's
 * photograph, because by "Order received" time the photo (and any
 * player-uploaded badge) had already been swapped from a local blob: URL
 * to a private, signed S3 URL by orderWithUploadedAssets — a cross-origin
 * image html2canvas cannot draw onto canvas without the bucket's CORS
 * cooperation, even though the very same <img> displays fine anywhere
 * else on the page. A first fix attempt (fetching that URL directly from
 * the browser) hit exactly this: confirmed via a live browser console log
 * as a genuine CORS block from the (correctly private) production bucket,
 * not a bug in the fetch call. The actual fix is a same-origin server-side
 * proxy (/api/card-share/photo, backed by migration 0079's
 * get_card_share_asset_key) — captureShareImage cannot be unit-tested
 * directly (no jsdom — see this file's own top comment), so this proves
 * the fix's actual wiring by reading the source: every remote image is
 * localised via the proxy to a blob: URL before the capture rig ever
 * renders, and capture is gated on every rendered <img> genuinely having
 * pixel dimensions, not merely on decode() resolving.
 */
describe('ProductionBuilder — captureShareImage waits for and verifies the player photograph specifically', () => {
  it('fetches and localises the photo via the same-origin proxy before ever calling setShareCapturePlayer, when it is not already local', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const photoFetchIdx = fnBody.indexOf("fetchProxiedShareAssetAsLocalUrl('photo', orderIdForCapture)");
    const setCaptureIdx = fnBody.indexOf('setShareCapturePlayer(capturePlayer)');
    expect(photoFetchIdx).toBeGreaterThan(-1);
    expect(setCaptureIdx).toBeGreaterThan(photoFetchIdx);
  });

  it('also localises a player-uploaded badge via the same proxy, not only the photograph — both are "visible club/team elements" subject to the same swap', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("fetchProxiedShareAssetAsLocalUrl('badge', orderIdForCapture)");
  });

  it('never re-fetches an already-local (blob:/data:) or same-origin bundled (root-relative) image URL', () => {
    const idx = builder.indexOf('const needsLocalizing');
    const fnBody = builder.slice(idx, builder.indexOf('\n\n', idx));
    expect(fnBody).toContain('isLocalAssetUrl(url!)');
    expect(fnBody).toContain("url!.startsWith('/')");
  });

  it('requires an order id before capturing anything — the proxy has nothing to key off of otherwise (checked generically, so both the ordinary builder and Squad Invite callers are covered by the one guard)', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("if (!orderIdForCapture) throw new Error('Could not prepare card image');");
  });

  it('the proxy call never sends a client-supplied key or S3 URL — only the caller-supplied orderId and kind', () => {
    const idx = builder.indexOf('const fetchProxiedShareAssetAsLocalUrl');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("body: JSON.stringify({ orderId: orderIdForProxy, kind })");
    expect(fnBody).not.toMatch(/photoUrl|badgeUrl|storageKey/);
  });

  it('a failed fetch of a required image throws, rather than proceeding to render/capture an incomplete card', () => {
    const idx = builder.indexOf('const fetchProxiedShareAssetAsLocalUrl');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('if (!response.ok) throw new Error');
  });

  it('rejects the capture (throws) if any rendered image has zero natural dimensions, even after waitForImages resolved — the real capture-ready gate, not just a hopeful wait', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const waitIdx = fnBody.indexOf('await waitForImages(el)');
    const gateIdx = fnBody.indexOf('naturalWidth === 0 || img.naturalHeight === 0');
    const throwIdx = fnBody.indexOf("throw new Error('Could not prepare the card image for sharing')");
    expect(waitIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(waitIdx);
    expect(throwIdx).toBeGreaterThan(gateIdx);
  });

  it('the capture-ready gate runs before captureElementToPng, never after', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const gateIdx = fnBody.indexOf('naturalWidth === 0');
    const captureIdx = fnBody.indexOf('captureElementToPng(el');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(gateIdx);
  });

  it('always releases every localised object URL, on both the success and failure paths, via an outer finally', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const lastFinallyIdx = fnBody.lastIndexOf('finally {');
    expect(lastFinallyIdx).toBeGreaterThan(-1);
    expect(fnBody.slice(lastFinallyIdx)).toContain('for (const revoke of revokers) revoke();');
  });

  it('still never calls renderPrintFile or exposes print-production artwork while doing any of this', () => {
    const idx = builder.indexOf('const captureShareImageFor');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).not.toContain('renderPrintFile');
    expect(fnBody).not.toMatch(/pdf-generator|buildFullBleedRaster/);
  });
});

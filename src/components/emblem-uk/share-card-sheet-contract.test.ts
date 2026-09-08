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
 * closing creates nothing, Web Share attempted before the copy-link
 * fallback, object URLs released) can only be proven by reading the
 * source.
 */
describe('ShareCardSheet — consent is recorded before any image is generated', () => {
  it('ensurePrepared calls recordCardShareConsent before calling getShareImage', () => {
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
    expect(sheet.slice(failReturnIdx, getImageIdx)).toContain('return null;');
  });
});

describe('ShareCardSheet — duplicate clicks do not create duplicate confirmed events', () => {
  it('ensurePrepared returns the SAME in-flight promise to every caller instead of starting a second attempt — the mechanism behind "prevent duplicate operations"', () => {
    const idx = sheet.indexOf('const ensurePrepared');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).toContain('if (preparePromiseRef.current) return preparePromiseRef.current;');
    expect(fnBody).toContain('preparePromiseRef.current = attempt;');
  });

  it('already-prepared state is returned synchronously without re-running consent/capture at all', () => {
    const idx = sheet.indexOf('const ensurePrepared');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    const preparedCheckIdx = fnBody.indexOf('if (prepared) return Promise.resolve(prepared);');
    const consentIdx = fnBody.indexOf('recordCardShareConsent(orderId');
    expect(preparedCheckIdx).toBeGreaterThan(-1);
    expect(consentIdx).toBeGreaterThan(preparedCheckIdx);
  });

  it('the in-flight ref is always cleared once the attempt settles, so a genuine retry after failure is always possible', () => {
    const idx = sheet.indexOf('const ensurePrepared');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).toContain('void attempt.finally(() => {');
    expect(fnBody).toContain('if (preparePromiseRef.current === attempt) preparePromiseRef.current = null;');
  });
});

describe('ShareCardSheet — closing the panel creates nothing', () => {
  it('handleClose never calls getShareImage', () => {
    const closeFnIdx = sheet.indexOf('const handleClose');
    const nextFnIdx = sheet.indexOf('const ensurePrepared');
    const closeBody = sheet.slice(closeFnIdx, nextFnIdx);
    expect(closeBody).not.toContain('getShareImage');
    expect(closeBody).toContain("recordCardShareConsent(orderId, 'cancelled')");
  });

  it('reopening resets checked, any error, and any previously prepared share, so a new consent event is genuinely fresh', () => {
    const idx = sheet.indexOf('const resetPanelState');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).toContain('setChecked(false);');
    expect(fnBody).toContain('setErrorMessage(null);');
    expect(fnBody).toContain('setPrepared(null);');
    const openIdx = sheet.indexOf('const handleOpen');
    const openBody = sheet.slice(openIdx, sheet.indexOf('\n  };', openIdx));
    expect(openBody).toContain('resetPanelState();');
  });
});

describe('ShareCardSheet — sharing mechanism order and cleanup', () => {
  it('attempts navigator.share (Web Share API with a File) inside handleShareNow, gated by the real canShareFile(file) check', () => {
    const idx = sheet.indexOf('const handleShareNow');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    const shareIdx = fnBody.indexOf('navigator.share(');
    const gateIdx = fnBody.indexOf('canShareFile(file)');
    expect(shareIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(shareIdx);
  });

  it('canShareFile checks navigator.share and navigator.canShare with the real file, never assumed from the API\'s mere presence', () => {
    const idx = sheet.indexOf('function canShareFile');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n}', idx));
    expect(fnBody).toContain("typeof navigator.share === 'function'");
    expect(fnBody).toContain("typeof navigator.canShare === 'function'");
    expect(fnBody).toContain('navigator.canShare({ files: [file] })');
  });

  it('the actual download (createObjectURL) only ever runs from handleDownloadNow — a separate function neither handleShareNow, handleCopyLink nor handleCopyMessage ever calls', () => {
    const downloadFnIdx = sheet.indexOf('const handleDownloadNow');
    expect(downloadFnIdx).toBeGreaterThan(-1);
    const fnBody = sheet.slice(downloadFnIdx, sheet.indexOf('\n  };', downloadFnIdx));
    expect(fnBody).toContain('URL.createObjectURL(share.blob)');

    for (const fn of ['handleShareNow', 'handleCopyLink', 'handleCopyMessage']) {
      const idx = sheet.indexOf(`const ${fn}`);
      const body = sheet.slice(idx, sheet.indexOf('\n  };', idx));
      expect(body).not.toContain('createObjectURL');
    }
  });

  it('revokes the object URL immediately after triggering the download, via finally', () => {
    const createIdx = sheet.indexOf('URL.createObjectURL(share.blob)');
    const revokeIdx = sheet.indexOf('URL.revokeObjectURL(objectUrl)');
    const finallyIdx = sheet.indexOf('finally {', createIdx);
    expect(createIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(createIdx);
    expect(revokeIdx).toBeGreaterThan(finallyIdx);
  });

  it('downloading writes nothing to the clipboard — only Copy link and Copy message do that, each from its own explicit click', () => {
    const idx = sheet.indexOf('const handleDownloadNow');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).not.toContain('clipboard');
  });

  it('never persists the generated image anywhere beyond the in-flight fetch/blob conversion (no fetch to an upload endpoint, no new storage call)', () => {
    expect(sheet).not.toMatch(/\/api\/order-assets|createServiceRoleClient|storage\.from/);
  });

  it('never creates a public /share/... page, a signed URL, or any recipient-specific link — the only URL ever shared is the real per-share public page created through createCardSharePublicPage', () => {
    expect(sheet).not.toMatch(/\/share\/|getSignedDownloadUrl|signedUrl/i);
  });
});

describe('ShareCardSheet — each failure stage has its own distinct message, so a report identifies which stage broke', () => {
  it('getShareImage() failing sets CARD_SHARE_CAPTURE_FAILURE, not the generic message', () => {
    const idx = sheet.indexOf('dataUrl = await getShareImage();');
    const catchIdx = sheet.indexOf('catch {', idx);
    const section = sheet.slice(catchIdx, sheet.indexOf('return null;', catchIdx));
    expect(section).toContain('setErrorMessage(CARD_SHARE_CAPTURE_FAILURE)');
    expect(section).not.toContain('CARD_SHARE_GENERIC_FAILURE');
  });

  it('createCardSharePublicPage failing without its own server-provided error sets CARD_SHARE_LINK_FAILURE, not the generic message', () => {
    const idx = sheet.indexOf('const publicPage = await createCardSharePublicPage');
    const section = sheet.slice(idx, sheet.indexOf('return null;', idx));
    expect(section).toContain('publicPage.error || CARD_SHARE_LINK_FAILURE');
    expect(section).not.toContain('CARD_SHARE_GENERIC_FAILURE');
  });

  it('a server-provided error from createCardSharePublicPage is still shown verbatim, never overridden by the generic fallback', () => {
    const idx = sheet.indexOf('const publicPage = await createCardSharePublicPage');
    const section = sheet.slice(idx, sheet.indexOf('return null;', idx));
    expect(section).toMatch(/setErrorMessage\(publicPage\.error\s*\|\|/);
  });
});

describe('ShareCardSheet — the shared text carries the real per-share link (migration 0085), appears exactly once, and is never derived from a client-supplied value', () => {
  it('navigator.share is called with the file and the prepared messageText only — never also a separate url (which caused the reported duplication)', () => {
    const idx = sheet.indexOf('navigator.share({');
    const callBody = sheet.slice(idx, sheet.indexOf('});', idx));
    expect(callBody).toContain('files: [file]');
    expect(callBody).toContain('text: share.messageText');
    expect(callBody).not.toContain('url:');
    expect(callBody).not.toContain('orderId');
  });

  it('messageText is built inside ensurePrepared from a genuine public-page token (createCardSharePublicPage), never a template literal or concatenation the client controls', () => {
    expect(sheet).toContain('const publicPage = await createCardSharePublicPage(orderId, dataUrl);');
    expect(sheet).toContain('const shareUrl = cardSharePublicPageUrl(publicPage.token);');
    expect(sheet).toContain('const messageText = buildCardShareMessageText(shareUrl);');
  });

  it('an ineligible/failed public-page creation fails the whole prepare attempt before ever calling navigator.share or getShareImage a second time', () => {
    const createIdx = sheet.indexOf('createCardSharePublicPage(orderId, dataUrl)');
    const failIdx = sheet.indexOf('if (!publicPage.ok || !publicPage.token)');
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

  it('Copy message copies the prepared share\'s real messageText, never the generic preview constant, once prepared', () => {
    const idx = sheet.indexOf('const handleCopyMessage');
    const fnBody = sheet.slice(idx, sheet.indexOf('\n  };', idx));
    expect(fnBody).toContain('navigator.clipboard.writeText(share.messageText)');
  });
});

/**
 * The Web Share API gives calling code no way to learn whether the target
 * app actually displayed `text` — only whether the whole call resolved or
 * rejected. Manual testing found WhatsApp Desktop specifically drops the
 * caption while still accepting the file. Since this can't be detected,
 * the honest fix is to never confidently claim the message was included:
 * a defensive clipboard copy happens after every successful native share.
 */
describe('ShareCardSheet — honest handling of a platform that may silently drop the caption', () => {
  it('after a successful navigator.share, the message is also copied to the clipboard defensively, before reporting success', () => {
    const shareIdx = sheet.indexOf('navigator.share({');
    const shareCloseIdx = sheet.indexOf('});', shareIdx);
    const sharedSetIdx = sheet.indexOf('setShared(true)', shareCloseIdx);
    const clipboardIdx = sheet.indexOf('navigator.clipboard.writeText(share.messageText)', shareCloseIdx);
    expect(clipboardIdx).toBeGreaterThan(shareCloseIdx);
    expect(sharedSetIdx).toBeGreaterThan(clipboardIdx);
  });

  it('a clipboard failure after a successful share is swallowed locally and never reported as a failed/cancelled share', () => {
    const shareIdx = sheet.indexOf('navigator.share({');
    const shareCloseIdx = sheet.indexOf('});', shareIdx);
    const clipboardIdx = sheet.indexOf('navigator.clipboard.writeText(share.messageText)', shareCloseIdx);
    const localCatchIdx = sheet.indexOf('} catch {', clipboardIdx);
    const sharedSetIdx = sheet.indexOf('setShared(true)', shareCloseIdx);
    expect(localCatchIdx).toBeGreaterThan(clipboardIdx);
    expect(localCatchIdx).toBeLessThan(sharedSetIdx);
  });

  it('cancelling the native share sheet is never treated as a failure and never demotes Copy link to primary — it silently returns, changing nothing else', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 60);
    expect(section).toContain('return;');
    expect(section).not.toContain('setShareUnavailable');
  });

  it('cancelling the native share sheet records no confirmed consent of its own (consent was already recorded once, by ensurePrepared, before the share attempt) and writes nothing to the clipboard', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 60);
    expect(section).not.toContain("recordCardShareConsent(orderId, 'confirmed')");
    expect(section).not.toContain('navigator.clipboard');
  });

  it('a genuine (non-cancel) share failure sets shareUnavailable, making Copy link the primary action from then on — the explicit fallback the product spec requires', () => {
    const idx = sheet.indexOf("shareErr.name === 'AbortError'");
    const section = sheet.slice(idx, sheet.indexOf('\n    }', idx));
    expect(section).toContain('setShareUnavailable(true);');
  });

  it('a device that never supported navigator.share starts with Copy link already primary, before any attempt is even made', () => {
    const idx = sheet.indexOf('const [shareUnavailable, setShareUnavailable] = useState(');
    const section = sheet.slice(idx, sheet.indexOf(');', idx) + 1);
    expect(section).toContain("typeof navigator.share === 'function'");
  });
});

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

  it('the compact thumbnail uses the identical container-query scaling technique, at its own smaller width, so it is never distorted or stretched', () => {
    const idx = css.indexOf('.uk-card-share-thumb {');
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('aspect-ratio: 340 / 476');
    expect(rule).toContain('container-type: inline-size');
    const childIdx = css.indexOf('.uk-card-share-thumb .uk-real-card > div {');
    expect(childIdx).toBeGreaterThan(-1);
    expect(css.slice(childIdx, css.indexOf('\n}', childIdx))).toContain('transform: scale(calc(100cqw / 340px))');
  });

  it('the thumbnail also constrains the implicit grid column — live-measured regression: omitting this rendered the scaled card almost entirely outside the 44px visible window, at a large negative offset, not merely off-centre', () => {
    const idx = css.indexOf('.uk-card-share-thumb .uk-real-card {');
    expect(idx).toBeGreaterThan(-1);
    const rule = css.slice(idx, css.indexOf('\n}', idx));
    expect(rule).toContain('grid-template-columns: minmax(0, 1fr)');
  });
});

describe('ShareCardSheet — visibility gating', () => {
  it('the design preview is never gated on eligibility — only the share control and any blocked message are', () => {
    const returnIdx = sheet.indexOf('return (');
    const bodyBeforeReturn = sheet.slice(0, returnIdx);
    expect(bodyBeforeReturn).not.toMatch(/return null;\n {2}\}\n/);
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

  it('the confirmation checkbox never starts pre-ticked — every open (fresh or reopened) resets it via resetPanelState', () => {
    expect(sheet).toContain('checked={checked}');
    expect(sheet).not.toContain('checked={true}');
    const idx = sheet.indexOf('const resetPanelState');
    expect(sheet.slice(idx, sheet.indexOf('\n  };', idx))).toContain('setChecked(false);');
  });
});

describe('ShareCardSheet — rotate control and order summary', () => {
  it('renders a rotate control, always (never gated on eligibility, unlike the share icon)', () => {
    const idx = sheet.indexOf('uk-card-share-icon-btn rotate');
    expect(idx).toBeGreaterThan(-1);
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
    expect(sheet).toContain('className="uk-card-share-preview-card" style={{ transform: `rotate(${rotation}deg)` }}');
  });

  it('the share icon button and the rotate button are positioned as siblings of the rotating wrapper, not inside it — so they never rotate with the card', () => {
    const wrapperIdx = sheet.indexOf('uk-card-share-preview-card');
    const wrapperCloseIdx = sheet.indexOf('</div>', wrapperIdx);
    const rotateBtnIdx = sheet.indexOf('uk-card-share-icon-btn rotate');
    expect(rotateBtnIdx).toBeGreaterThan(wrapperCloseIdx);
  });

  it('the share icon button returns keyboard focus to itself once the panel closes, via its own ref', () => {
    expect(sheet).toContain('ref={shareIconRef}');
    const idx = sheet.indexOf("if (stage.type === 'closed') shareIconRef.current?.focus();");
    expect(idx).toBeGreaterThan(-1);
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

describe('ShareCardSheet — the design preview, thumbnail, and share affordance', () => {
  it('renders the caller-supplied preview inside the same box the share icon sits on', () => {
    const previewIdx = sheet.indexOf('<div className="uk-card-share-preview">');
    const braceIdx = sheet.indexOf('{preview}', previewIdx);
    const iconBtnIdx = sheet.indexOf('uk-card-share-icon-btn', previewIdx);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(braceIdx).toBeGreaterThan(previewIdx);
    expect(iconBtnIdx).toBeGreaterThan(braceIdx);
  });

  it('the compact thumbnail renders the SAME preview node a second time — never a separate rendering path that could drift out of sync with the real design', () => {
    const idx = sheet.indexOf('uk-card-share-thumb"');
    const section = sheet.slice(idx, idx + 100);
    expect(section).toContain('{preview}');
  });

  it('the share icon button only appears once eligible and while the panel is closed', () => {
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

  it('the panel is a clearly visible, labelled close control — not just an aria-label on a bare icon', () => {
    expect(sheet).toContain('className="uk-card-share-close" aria-label="Close"');
  });

  it('the panel renders as a dismissible overlay, and the backdrop click closes the same way the close button does', () => {
    const idx = sheet.indexOf('uk-card-share-modal-backdrop');
    const section = sheet.slice(idx, idx + 400);
    expect(section).toContain('onClick={handleClose}');
    expect(section).toContain('onClick={(event) => event.stopPropagation()}');
  });

  it('Escape closes the overlay the same safe way the close button does (never a silent close that skips recording cancellation)', () => {
    const idx = sheet.indexOf("if (event.key === 'Escape')");
    expect(idx).toBeGreaterThan(-1);
    const section = sheet.slice(idx, idx + 60);
    expect(section).toContain('handleClose();');
  });

  it('moves focus into the overlay when it opens (including while preparing, not only once fully open), and keeps Tab cycling within its own controls only', () => {
    const idx = sheet.indexOf("if (stage.type === 'closed') return;");
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

  it('still records the same consent version/warning/recall copy inside the redesigned panel — the redesign never touches what is disclosed or agreed to', () => {
    const idx = sheet.indexOf('className="uk-card-share-modal"');
    const fnBody = sheet.slice(idx, sheet.indexOf('</div>\n      )}', idx));
    expect(fnBody).toContain('{CARD_SHARE_WARNING}');
    expect(fnBody).toContain('{CARD_SHARE_RECALL_NOTICE}');
    expect(fnBody).toContain('{CARD_SHARE_CONFIRMATION_LABEL}');
  });

  it('every one of Share now / Copy link / Copy message / Download image is disabled until the guardian ticks the acknowledgement', () => {
    const idx = sheet.indexOf('className="uk-card-share-modal"');
    const fnBody = sheet.slice(idx, sheet.indexOf('</div>\n      )}', idx));
    const disabledCount = (fnBody.match(/disabled=\{!checked/g) || []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(4);
  });

  it('shows accurate, action-specific feedback text — "Link copied", "Message copied", "Download started" — never one generic "Copied" for every button', () => {
    expect(sheet).toContain("linkCopied ? 'Link copied' : 'Copy link'");
    expect(sheet).toContain("messageCopied ? 'Message copied' : 'Copy message'");
    expect(sheet).toContain("downloadStarted ? 'Download started' : 'Download image'");
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

  it('passes the real, visible, on-screen PlayerCard as the preview, the real order id, and the real collection/player/print summary — never the off-screen capture rig\'s player, and no leftover diagnostic props', () => {
    const idx = builder.indexOf('<ShareCardSheet');
    const tagSection = builder.slice(idx, idx + 650);
    expect(tagSection).toContain('orderId={shareableOrderContext.orderId}');
    expect(tagSection).toContain('preview={<PlayerCard order={order} player={shareableOrderContext.player} side="front" />}');
    expect(tagSection).toContain("collectionName: order.collectionName || 'Custom Collection'");
    expect(tagSection).toContain('playerCount: summary.approvedPlayers.length');
    expect(tagSection).toContain('printCount: summary.approvedPrints');
    expect(tagSection).not.toContain('getCaptureDiagnostics');
    expect(tagSection).not.toContain('currentPlayerSnapshot');
  });

  it('no diagnostic plumbing remains anywhere in this file: no CaptureDiagnostics type, no diagnostics ref, no per-capture content hashing/dimension measuring', () => {
    expect(builder).not.toContain('CaptureDiagnostics');
    expect(builder).not.toContain('lastCaptureDiagnosticsRef');
    expect(builder).not.toContain('getCaptureDiagnostics');
    expect(builder).not.toContain('shortContentHash');
    expect(builder).not.toContain('measureDataUrlDimensions');
    expect(builder).not.toContain('offscreenImageTransforms');
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
 * else on the page. The actual fix is a same-origin server-side proxy
 * (/api/card-share/photo, backed by migration 0079's
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
    expect(fnBody).toContain('body: JSON.stringify({ orderId: orderIdForProxy, kind })');
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

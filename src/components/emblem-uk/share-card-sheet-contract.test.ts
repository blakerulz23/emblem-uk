import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync('src/components/emblem-uk/ShareCardSheet.tsx', 'utf8');
const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

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
 * Web Share now also carries the fixed, generic message/link (never
 * anything derived from this order) alongside the file — and the download
 * fallback surfaces the same link visibly, since a plain file download has
 * no text/url fields of its own to carry it in.
 */
describe('ShareCardSheet — the shared text/link is fixed, generic, and never derived from this order', () => {
  it('navigator.share is called with the file, the fixed text, and the fixed generic url — never anything computed from orderId', () => {
    const idx = sheet.indexOf('navigator.share({');
    const callBody = sheet.slice(idx, sheet.indexOf('});', idx));
    expect(callBody).toContain('files: [file]');
    expect(callBody).toContain('text: CARD_SHARE_MESSAGE_TEXT');
    expect(callBody).toContain('url: CARD_SHARE_LINK_URL');
    expect(callBody).not.toContain('orderId');
  });

  it('the downloaded-status message shows a visible link to the same fixed generic builder URL', () => {
    const idx = sheet.indexOf("stage.type === 'downloaded'");
    const section = sheet.slice(idx, idx + 250);
    expect(section).toContain('href={CARD_SHARE_LINK_URL}');
    expect(section).toContain('Create your own card');
  });

  it('cancelling the native share sheet is never reported as a successful share', () => {
    const idx = sheet.indexOf("err.name === 'AbortError'");
    const section = sheet.slice(idx, idx + 100);
    expect(section).toContain("dispatch({ type: 'reset' });");
    expect(section).not.toContain("dispatch({ type: 'shared' })");
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

  it('captureShareImage never calls renderPrintFile — only the plain (mark-free) captureElementToPng', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('captureElementToPng(el');
    expect(fnBody).not.toContain('renderPrintFile');
  });

  it('captureShareImage uses a lower pixelRatio than the print pipeline\'s own pixelRatio: 3', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('pixelRatio: 2');
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
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const photoFetchIdx = fnBody.indexOf("fetchProxiedShareAssetAsLocalUrl('photo')");
    const setCaptureIdx = fnBody.indexOf('setShareCapturePlayer(capturePlayer)');
    expect(photoFetchIdx).toBeGreaterThan(-1);
    expect(setCaptureIdx).toBeGreaterThan(photoFetchIdx);
  });

  it('also localises a player-uploaded badge via the same proxy, not only the photograph — both are "visible club/team elements" subject to the same swap', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("fetchProxiedShareAssetAsLocalUrl('badge')");
  });

  it('never re-fetches an already-local (blob:/data:) or same-origin bundled (root-relative) image URL', () => {
    const idx = builder.indexOf('const needsLocalizing');
    const fnBody = builder.slice(idx, builder.indexOf('\n\n', idx));
    expect(fnBody).toContain('isLocalAssetUrl(url!)');
    expect(fnBody).toContain("url!.startsWith('/')");
  });

  it('requires a submitted order id before capturing anything — the proxy has nothing to key off of otherwise', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("if (!submittedOrderId) throw new Error('Could not prepare card image');");
  });

  it('the proxy call never sends a client-supplied key or S3 URL — only orderId and kind', () => {
    const idx = builder.indexOf('const fetchProxiedShareAssetAsLocalUrl');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain("body: JSON.stringify({ orderId: submittedOrderId, kind })");
    expect(fnBody).not.toMatch(/photoUrl|badgeUrl|storageKey/);
  });

  it('a failed fetch of a required image throws, rather than proceeding to render/capture an incomplete card', () => {
    const idx = builder.indexOf('const fetchProxiedShareAssetAsLocalUrl');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).toContain('if (!response.ok) throw new Error');
  });

  it('rejects the capture (throws) if any rendered image has zero natural dimensions, even after waitForImages resolved — the real capture-ready gate, not just a hopeful wait', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const waitIdx = fnBody.indexOf('await waitForImages(el)');
    const gateIdx = fnBody.indexOf('naturalWidth === 0 || img.naturalHeight === 0');
    const throwIdx = fnBody.indexOf("throw new Error('Could not prepare the card image for sharing')");
    expect(waitIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(waitIdx);
    expect(throwIdx).toBeGreaterThan(gateIdx);
  });

  it('the capture-ready gate runs before captureElementToPng, never after', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const gateIdx = fnBody.indexOf('naturalWidth === 0');
    const captureIdx = fnBody.indexOf('captureElementToPng(el');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(gateIdx);
  });

  it('always releases every localised object URL, on both the success and failure paths, via an outer finally', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    const lastFinallyIdx = fnBody.lastIndexOf('finally {');
    expect(lastFinallyIdx).toBeGreaterThan(-1);
    expect(fnBody.slice(lastFinallyIdx)).toContain('for (const revoke of revokers) revoke();');
  });

  it('still never calls renderPrintFile or exposes print-production artwork while doing any of this', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('\n  };', idx));
    expect(fnBody).not.toContain('renderPrintFile');
    expect(fnBody).not.toMatch(/pdf-generator|buildFullBleedRaster/);
  });
});

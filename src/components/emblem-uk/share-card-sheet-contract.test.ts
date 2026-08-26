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
});

describe('ShareCardSheet — visibility gating', () => {
  it('renders nothing until eligibility has resolved (no flash of a blocked/unavailable state)', () => {
    expect(sheet).toContain('if (!eligibility) return null;');
  });

  it('hides entirely (not a blocked message) for reasons shouldHideCardShareEntirely marks as such', () => {
    expect(sheet).toContain('shouldHideCardShareEntirely(eligibility.reason)) return null;');
  });

  it('the confirmation sheet never pre-ticks the checkbox — opening always starts unticked (cardShareStageReducer\'s own "open" case)', () => {
    expect(sheet).toContain("checked={stage.checked}");
    expect(sheet).not.toContain('checked={true}');
  });
});

describe('ProductionBuilder — ShareCardSheet is only mounted for a single-child, directly-confirmed order', () => {
  it('gates ShareCardSheet on enquiryStatus sent, authority confirmed, and order.type single, independent of the server\'s own re-check', () => {
    const idx = builder.indexOf('<ShareCardSheet');
    const gateSection = builder.slice(Math.max(0, idx - 700), idx);
    expect(gateSection).toContain("enquiryStatus !== 'sent'");
    expect(gateSection).toContain("submittedAuthorityStatus !== 'confirmed'");
    expect(gateSection).toContain("order.type !== 'single'");
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

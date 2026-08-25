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
    expect(builder).toContain('const [shareCaptureMode, setShareCaptureMode] = useState(false);');
    expect(builder).toContain('const shareCaptureRef = useRef<HTMLDivElement | null>(null);');
    expect(builder).not.toMatch(/captureMode\s*&&\s*shareCaptureMode|shareCaptureMode\s*&&\s*captureMode/);
  });

  it('captureShareImage never calls renderPrintFile — only the plain (mark-free) captureElementToPng', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('};', idx));
    expect(fnBody).toContain('captureElementToPng(el');
    expect(fnBody).not.toContain('renderPrintFile');
  });

  it('captureShareImage uses a lower pixelRatio than the print pipeline\'s own pixelRatio: 3', () => {
    const idx = builder.indexOf('const captureShareImage');
    const fnBody = builder.slice(idx, builder.indexOf('};', idx));
    expect(fnBody).toContain('pixelRatio: 2');
  });
});

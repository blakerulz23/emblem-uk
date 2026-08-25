import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SOCIAL_SHARE_FILENAME, downloadBlob, recordCardShareConsent, shareOrDownloadSocialImage } from './card-share';

/**
 * This repo's test suite runs in the plain Node environment (no jsdom
 * dependency installed) — Blob/File/URL/navigator are all real Node
 * globals, but `document` is not. downloadBlob's only DOM usage is a
 * synchronous createElement('a') + body append/click/remove, so a minimal
 * hand-written stub covers it without adding a new test dependency.
 */
function withFakeDocument<T>(run: () => T): T {
  const clickedLinks: { href: string; download: string }[] = [];
  const fakeLink = {
    href: '',
    download: '',
    click() {
      clickedLinks.push({ href: this.href, download: this.download });
    },
  };
  const fakeDocument = {
    createElement: () => fakeLink,
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = fakeDocument;
  try {
    return run();
  } finally {
    (globalThis as { document?: unknown }).document = original;
  }
}

describe('SOCIAL_SHARE_FILENAME', () => {
  it('is always exactly the generic constant, never containing an interpolated value', () => {
    expect(SOCIAL_SHARE_FILENAME).toBe('emblem-card.png');
    expect(SOCIAL_SHARE_FILENAME).not.toMatch(/\$\{|order|token|club|player/i);
  });
});

describe('recordCardShareConsent', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /api/card-share/consent with exactly the four narrow fields', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    await recordCardShareConsent({
      orderId: 'order-1',
      confirmedAuthority: true,
      confirmedRecallUnderstanding: true,
      consentWordingVersion: 'v1',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/card-share/consent',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orderId: 'order-1',
          confirmedAuthority: true,
          confirmedRecallUnderstanding: true,
          consentWordingVersion: 'v1',
        }),
      })
    );
  });

  it('returns ok:false on a non-ok HTTP response, without throwing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await recordCardShareConsent({ orderId: 'order-1', confirmedAuthority: true, confirmedRecallUnderstanding: true, consentWordingVersion: 'v1' });
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false when the response body has no explicit ok:true, even on HTTP 200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await recordCardShareConsent({ orderId: 'order-1', confirmedAuthority: true, confirmedRecallUnderstanding: true, consentWordingVersion: 'v1' });
    expect(result).toEqual({ ok: false });
  });
});

describe('shareOrDownloadSocialImage', () => {
  const blob = new Blob(['x'], { type: 'image/png' });

  afterEach(() => {
    // @ts-expect-error test cleanup of a possibly-deleted global
    delete navigator.share;
    // @ts-expect-error test cleanup of a possibly-deleted global
    delete navigator.canShare;
  });

  it('falls back to download when navigator.share is unsupported', async () => {
    const outcome = await withFakeDocument(() => shareOrDownloadSocialImage(blob, 'Card'));
    expect(outcome.kind).toBe('downloaded');
  });

  it('uses navigator.share when canShare({files}) is true, and reports "shared" on success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const outcome = await shareOrDownloadSocialImage(blob, 'Card');
    expect(share).toHaveBeenCalled();
    expect(outcome.kind).toBe('shared');
  });

  it('treats a cancelled native share (AbortError) as a normal, silent outcome — never rethrown', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const outcome = await shareOrDownloadSocialImage(blob, 'Card');
    expect(outcome.kind).toBe('cancelled');
  });

  it('rethrows a genuine (non-abort) share failure so the caller can show a generic error', async () => {
    const realError = new Error('some real failure');
    const share = vi.fn().mockRejectedValue(realError);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    await expect(shareOrDownloadSocialImage(blob, 'Card')).rejects.toThrow('some real failure');
  });

  it('the shared File always uses the generic filename, never a per-order or per-child name', async () => {
    let capturedFile: File | null = null;
    const share = vi.fn().mockImplementation(async (data: ShareData) => {
      capturedFile = data.files?.[0] ?? null;
    });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    await shareOrDownloadSocialImage(blob, 'Card');
    expect(capturedFile!.name).toBe(SOCIAL_SHARE_FILENAME);
  });
});

describe('downloadBlob', () => {
  it('creates and revokes an object URL around the download click', () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    withFakeDocument(() => downloadBlob(blob));
    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url');
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('always uses the generic filename for the download attribute', () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let downloadAttr = '';
    const fakeDocument = {
      createElement: () => ({
        href: '',
        download: '',
        click() {
          downloadAttr = this.download;
        },
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    };
    const original = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = fakeDocument;
    downloadBlob(blob);
    (globalThis as { document?: unknown }).document = original;
    expect(downloadAttr).toBe(SOCIAL_SHARE_FILENAME);
    vi.restoreAllMocks();
  });
});

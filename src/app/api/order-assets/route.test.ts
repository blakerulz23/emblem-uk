import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockUploadObject = vi.fn();
const mockGetSignedDownloadUrl = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
}));

const FAKE_EMAIL = 'zztest-guardian@example.invalid';
const FAKE_FILENAME = 'zztest-private-photo.jpg';
const FAKE_KEY = 'order-assets/zztest-order/child/1-photo.jpg';

function postForm(fields: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return POST(new NextRequest('http://localhost/api/order-assets', { method: 'POST', body: form }));
}

const IMAGE_FILE = new File([new Uint8Array([1, 2, 3, 4])], FAKE_FILENAME, { type: 'image/jpeg' });

beforeEach(() => {
  mockUploadObject.mockReset();
  mockGetSignedDownloadUrl.mockReset();
});

describe('POST /api/order-assets — safe failure logging', () => {
  it('unchanged success path: uploads and returns the expected shape', async () => {
    mockUploadObject.mockResolvedValue(FAKE_KEY);
    mockGetSignedDownloadUrl.mockResolvedValue('https://example.invalid/signed');
    const res = await postForm({ file: IMAGE_FILE, orderId: 'zztest-order', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(/^order-assets\/zztest-order\/child\/\d+-photo\.jpg$/);
    expect(mockUploadObject).toHaveBeenCalledTimes(1);
  });

  it('logs only a fixed route label and a safe category when storage is not configured — never the raw message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockRejectedValue(new Error('AWS_S3_BUCKET is not set'));
    const res = await postForm({ file: IMAGE_FILE, orderId: 'zztest-order', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Production asset storage is not configured');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toBe('order-assets:upload storage_not_configured');
    errorSpy.mockRestore();
  });

  it('logs only a fixed route label and a generic category for any other upload failure — never filenames, keys, emails or request bodies', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockRejectedValue(new Error(`S3 rejected object for ${FAKE_EMAIL} key=${FAKE_KEY}`));
    const res = await postForm({ file: IMAGE_FILE, orderId: 'zztest-order', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toBe('order-assets:upload upload_failed');
    expect(logged).not.toContain(FAKE_EMAIL);
    expect(logged).not.toContain(FAKE_KEY);
    expect(logged).not.toContain(FAKE_FILENAME);
    errorSpy.mockRestore();
  });

  it('the getSignedDownloadUrl failure path is logged with the same safe shape', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadObject.mockResolvedValue(FAKE_KEY);
    mockGetSignedDownloadUrl.mockRejectedValue(new Error('presign failed'));
    const res = await postForm({ file: IMAGE_FILE, orderId: 'zztest-order', playerId: 'child', kind: 'photo' });
    expect(res.status).toBe(500);
    const logged = errorSpy.mock.calls[0]?.join(' ') ?? '';
    expect(logged).toBe('order-assets:upload upload_failed');
    errorSpy.mockRestore();
  });
});

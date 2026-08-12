import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCardDefinitionLogo } from './card-definition-logo';

const mockGetSignedDownloadUrl = vi.fn();
vi.mock('./s3-client', () => ({
  getSignedDownloadUrl: (key: string, expires?: number) => mockGetSignedDownloadUrl(key, expires),
}));

beforeEach(() => mockGetSignedDownloadUrl.mockReset());

describe('resolveCardDefinitionLogo', () => {
  it('signs a structured private upload fresh from its storage key', async () => {
    mockGetSignedDownloadUrl.mockResolvedValue('https://signed.example/fresh');
    const raw = JSON.stringify({ storageKey: 'order-assets/submission/player/badge.png', source: 'upload' });
    await expect(resolveCardDefinitionLogo(raw, 300)).resolves.toBe('https://signed.example/fresh');
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith('order-assets/submission/player/badge.png', 300);
  });

  it('keeps static and legacy plain-string values readable without signing', async () => {
    await expect(resolveCardDefinitionLogo('/templates/emjfl/clubs/afc-oldham.png')).resolves.toBe('/templates/emjfl/clubs/afc-oldham.png');
    await expect(resolveCardDefinitionLogo('https://legacy.example/old-presigned-url')).resolves.toBe('https://legacy.example/old-presigned-url');
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('fails closed for malformed structured JSON', async () => {
    await expect(resolveCardDefinitionLogo(JSON.stringify({ source: 'upload', url: 'https://evil.example/badge.png' }))).resolves.toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

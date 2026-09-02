import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveCardSharePublicPage } from './card-share-public-page';

const mockRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: (name: string, args: unknown) => mockRpc(name, args) }),
}));

const mockGetSignedDownloadUrl = vi.fn();
vi.mock('@/lib/s3-client', () => ({
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
}));

const VALID_TOKEN = 'a'.repeat(64);

beforeEach(() => {
  mockRpc.mockReset();
  mockGetSignedDownloadUrl.mockReset();
});

describe('resolveCardSharePublicPage', () => {
  it('rejects a malformed token shape before ever querying the database', async () => {
    const result = await resolveCardSharePublicPage('not-a-real-token');
    expect(result).toEqual({ available: false });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls get_card_share_public_page with the token, and signs a fresh, short-lived URL for the resolved key', async () => {
    mockRpc.mockResolvedValue({ data: { available: true, frontImageKey: 'card-share-public/abc.jpg' }, error: null });
    mockGetSignedDownloadUrl.mockResolvedValue('https://signed.example/abc.jpg?sig=1');
    const result = await resolveCardSharePublicPage(VALID_TOKEN);
    expect(mockRpc).toHaveBeenCalledWith('get_card_share_public_page', { p_token: VALID_TOKEN });
    expect(mockGetSignedDownloadUrl).toHaveBeenCalledWith('card-share-public/abc.jpg', 15 * 60);
    expect(result).toEqual({ available: true, imageUrl: 'https://signed.example/abc.jpg?sig=1' });
  });

  it('reports unavailable, never throwing, when the RPC reports unavailable (expired/revoked/unknown — all the same shape)', async () => {
    mockRpc.mockResolvedValue({ data: { available: false }, error: null });
    const result = await resolveCardSharePublicPage(VALID_TOKEN);
    expect(result).toEqual({ available: false });
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('fails closed on a genuine RPC error, never treating it as available', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await resolveCardSharePublicPage(VALID_TOKEN);
    expect(result).toEqual({ available: false });
  });

  it('fails closed if signing the URL itself fails, rather than crashing the page', async () => {
    mockRpc.mockResolvedValue({ data: { available: true, frontImageKey: 'card-share-public/abc.jpg' }, error: null });
    mockGetSignedDownloadUrl.mockRejectedValue(new Error('S3 unavailable'));
    const result = await resolveCardSharePublicPage(VALID_TOKEN);
    expect(result).toEqual({ available: false });
  });
});

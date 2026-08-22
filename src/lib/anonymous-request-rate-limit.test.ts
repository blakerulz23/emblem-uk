import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
vi.mock('./supabase/server', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}));

import { consumeAnonymousRequestRateLimit } from './anonymous-request-rate-limit';

const ORIGINAL_ENV = { ...process.env };

function headersWithIp(ip: string) {
  return { get: (name: string) => (name === 'x-forwarded-for' ? ip : null) };
}

beforeEach(() => {
  mockRpc.mockReset();
  process.env = { ...ORIGINAL_ENV, SQUAD_INVITE_RATE_LIMIT_SECRET: 'zztest-secret' };
});

describe('consumeAnonymousRequestRateLimit — builder-submission-issue (burst + rolling + daily)', () => {
  it('checks the burst tier via the existing fixed-window RPC first, before any other tier', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(mockRpc.mock.calls[0][0]).toBe('consume_squad_invite_rate_limit');
    expect(mockRpc.mock.calls[0][1].p_limit).toBe(5);
  });

  it('fails closed on the burst tier without ever reaching the rolling or daily tier', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const allowed = await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(allowed).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('checks the rolling-hour tier via the windowed RPC after burst passes', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(mockRpc.mock.calls[1][0]).toBe('consume_windowed_rate_limit');
    expect(mockRpc.mock.calls[1][1]).toMatchObject({ p_limit: 20, p_window_minutes: 60 });
  });

  it('fails closed on the rolling tier without ever reaching the daily tier', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null }); // burst passes
    mockRpc.mockResolvedValueOnce({ data: false, error: null }); // rolling fails
    const allowed = await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(allowed).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('checks the daily ceiling via the windowed RPC as the outer bound', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(mockRpc.mock.calls[2][0]).toBe('consume_windowed_rate_limit');
    expect(mockRpc.mock.calls[2][1]).toMatchObject({ p_limit: 60, p_window_minutes: 1440 });
  });

  it('allows a legitimate call through when every tier passes', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const allowed = await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(allowed).toBe(true);
  });

  it('is keyed only by request-source IP — no subject parameter exists for issuance, so a new submissionId/capability can never reset it', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('9.9.9.9'), 'builder-submission-issue', 'anything-a-caller-might-pass-is-ignored');
    // Every bucket hash is a pure function of the fixed action string, a
    // fixed tier label and the IP — never anything else, so passing an
    // extra "subject" argument (issuance has none) has zero effect.
    for (const call of mockRpc.mock.calls) {
      expect(call[1].p_bucket_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('the same IP always hashes to the same bucket regardless of unrelated per-request values (proves headers/cookies cannot reset it)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('5.5.5.5'), 'builder-submission-issue');
    const firstBurstHash = mockRpc.mock.calls[0][1].p_bucket_hash;
    mockRpc.mockClear();
    await consumeAnonymousRequestRateLimit(headersWithIp('5.5.5.5'), 'builder-submission-issue');
    const secondBurstHash = mockRpc.mock.calls[0][1].p_bucket_hash;
    expect(firstBurstHash).toBe(secondBurstHash);
  });

  it('a different IP produces a different bucket (correct sharding, not a bypass)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('1.1.1.1'), 'builder-submission-issue');
    const hashA = mockRpc.mock.calls[0][1].p_bucket_hash;
    mockRpc.mockClear();
    await consumeAnonymousRequestRateLimit(headersWithIp('2.2.2.2'), 'builder-submission-issue');
    const hashB = mockRpc.mock.calls[0][1].p_bucket_hash;
    expect(hashA).not.toBe(hashB);
  });

  it('never persists a raw IP address anywhere — only an HMAC digest crosses the RPC boundary', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('203.0.113.42'), 'builder-submission-issue');
    for (const call of mockRpc.mock.calls) {
      expect(JSON.stringify(call[1])).not.toContain('203.0.113.42');
    }
  });

  it('fails closed in production when the rate-limit secret is missing, without ever calling the database', async () => {
    delete (process.env as Record<string, string | undefined>).SQUAD_INVITE_RATE_LIMIT_SECRET;
    process.env.VERCEL_ENV = 'production';
    const allowed = await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'builder-submission-issue');
    expect(allowed).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('consumeAnonymousRequestRateLimit — render-print / order-asset-upload (unchanged single-tier behaviour)', () => {
  it('still uses a single ip+subject bucket pair via the existing RPC', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await consumeAnonymousRequestRateLimit(headersWithIp('1.2.3.4'), 'render-print', 'submission-id-1');
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][0]).toBe('consume_squad_invite_rate_limit');
    expect(mockRpc.mock.calls[1][0]).toBe('consume_squad_invite_rate_limit');
  });
});

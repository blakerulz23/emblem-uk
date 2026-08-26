import { afterEach, describe, expect, it, vi } from 'vitest';
import { logBuilderAuthorityStage } from './builder-authority-diagnostics';

describe('logBuilderAuthorityStage', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    vi.restoreAllMocks();
  });

  it('is silent in production — these are diagnostic breadcrumbs, never a production log line', () => {
    process.env.VERCEL_ENV = 'production';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logBuilderAuthorityStage('declare:success');
    expect(spy).not.toHaveBeenCalled();
  });

  it('logs the stage label in preview, so a real re-test produces a traceable stage sequence in Vercel logs', () => {
    process.env.VERCEL_ENV = 'preview';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logBuilderAuthorityStage('declare:calling-rpc');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('declare:calling-rpc');
  });

  it('logs in local development too (VERCEL_ENV unset)', () => {
    delete process.env.VERCEL_ENV;
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logBuilderAuthorityStage('declare:received');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never includes anything beyond the fixed stage label — no way to pass a token, email, cookie or request body through this function\'s single string parameter', () => {
    process.env.VERCEL_ENV = 'preview';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logBuilderAuthorityStage('declare:success');
    expect(spy.mock.calls[0]).toHaveLength(1);
  });
});

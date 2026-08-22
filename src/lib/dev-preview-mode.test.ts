import { describe, expect, it, afterEach } from 'vitest';
import { isInternalDevPreviewEnabled } from './dev-preview-mode';

const ORIGINAL_ENV = { ...process.env };

function setEnv(vercelEnv: string | undefined, nodeEnv: string | undefined, devPreviewEnabled: string | undefined) {
  process.env = { ...ORIGINAL_ENV };
  const env = process.env as Record<string, string | undefined>;
  if (vercelEnv === undefined) delete env.VERCEL_ENV; else env.VERCEL_ENV = vercelEnv;
  if (nodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = nodeEnv;
  if (devPreviewEnabled === undefined) delete env.DEV_PREVIEW_ENABLED; else env.DEV_PREVIEW_ENABLED = devPreviewEnabled;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isInternalDevPreviewEnabled', () => {
  it('is always disabled on production, even with the flag set', () => {
    setEnv('production', undefined, 'true');
    expect(isInternalDevPreviewEnabled()).toBe(false);
  });

  it('is disabled on preview without the explicit flag', () => {
    setEnv('preview', undefined, undefined);
    expect(isInternalDevPreviewEnabled()).toBe(false);
  });

  it('is enabled on preview only with the explicit flag set to "true"', () => {
    setEnv('preview', undefined, 'true');
    expect(isInternalDevPreviewEnabled()).toBe(true);
  });

  it('is disabled in local dev without the explicit flag', () => {
    setEnv(undefined, 'development', undefined);
    expect(isInternalDevPreviewEnabled()).toBe(false);
  });

  it('is enabled in local dev only with NODE_ENV=development and the explicit flag', () => {
    setEnv(undefined, 'development', 'true');
    expect(isInternalDevPreviewEnabled()).toBe(true);
  });

  it('is disabled if NODE_ENV is not development, even with the flag set', () => {
    setEnv(undefined, 'test', 'true');
    expect(isInternalDevPreviewEnabled()).toBe(false);
  });
});

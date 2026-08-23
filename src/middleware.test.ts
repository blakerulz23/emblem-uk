import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { middleware, generateBuilderCsrfToken } from './middleware';

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

const GATED_PATHS = [
  '/test-print',
  '/card-setup-preview',
  '/dev/photo-crop-test',
  '/dev/story-update-scoping-test',
  '/os/prototype-player-profile',
];

describe('middleware — internal dev/prototype preview gate', () => {
  for (const path of GATED_PATHS) {
    it(`404s ${path} in production regardless of the preview flag`, async () => {
      setEnv('production', undefined, 'true');
      const res = await middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(404);
    });

    it(`404s ${path} in local dev without the explicit preview flag`, async () => {
      setEnv(undefined, 'development', undefined);
      const res = await middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(404);
    });

    it(`allows ${path} through in local dev with the explicit preview flag, applying no-index headers`, async () => {
      setEnv(undefined, 'development', 'true');
      const res = await middleware(new NextRequest(`http://localhost${path}`));
      expect(res.status).not.toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it(`404s a nested sub-path under ${path} the same way`, async () => {
      setEnv('production', undefined, undefined);
      const res = await middleware(new NextRequest(`http://localhost${path}/nested`));
      expect(res.status).toBe(404);
    });
  }
});

describe('middleware — builder CSRF cookie issuance', () => {
  it('sets a builder CSRF cookie on first visit to /builder', async () => {
    const res = await middleware(new NextRequest('http://localhost/builder'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('emblem_builder_csrf=');
    expect(setCookie.toLowerCase()).toContain('samesite=strict');
    expect(setCookie.toLowerCase()).not.toContain('httponly');
  });

  it('does not overwrite an existing builder CSRF cookie on a later visit', async () => {
    const request = new NextRequest('http://localhost/builder', { headers: { Cookie: 'emblem_builder_csrf=already-set-value' } });
    const res = await middleware(request);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('emblem_builder_csrf=');
  });

  it('sets a builder CSRF cookie on /test-print when the dev-preview flag allows it through', async () => {
    setEnv(undefined, 'development', 'true');
    const res = await middleware(new NextRequest('http://localhost/test-print'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('emblem_builder_csrf=');
  });

  it('never sets a builder CSRF cookie on an unrelated route', async () => {
    const res = await middleware(new NextRequest('http://localhost/about'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('emblem_builder_csrf=');
  });

  it('sets the builder CSRF cookie with unchanged path, max-age and secure attributes', async () => {
    setEnv(undefined, 'production', undefined);
    const res = await middleware(new NextRequest('http://localhost/builder'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('path=/');
    expect(setCookie.toLowerCase()).toContain('max-age=86400');
    expect(setCookie.toLowerCase()).toContain('secure');
  });
});

describe('middleware — Edge-safe builder CSRF token generation', () => {
  it('does not import or depend on Node crypto/Buffer', () => {
    const source = readFileSync(join(__dirname, 'middleware.ts'), 'utf8')
      // Strip comments first — this file's own doc-comments legitimately
      // discuss *why* Node crypto/Buffer are avoided, which would otherwise
      // false-positive against a bare word match.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/from\s+['"]crypto['"]/);
    expect(source).not.toMatch(/from\s+['"]node:crypto['"]/);
    expect(source).not.toMatch(/require\(\s*['"]node:?crypto['"]\s*\)/);
    expect(source).not.toMatch(/\bBuffer\b/);
  });

  it('calls crypto.getRandomValues with a 32-byte Uint8Array', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    generateBuilderCsrfToken();
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as Uint8Array;
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(arg.length).toBe(32);
    spy.mockRestore();
  });

  it('produces a 43-character unpadded base64url token containing only [A-Za-z0-9_-]', () => {
    const token = generateBuilderCsrfToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain('=');
  });

  it('produces a fresh token on each call', () => {
    const a = generateBuilderCsrfToken();
    const b = generateBuilderCsrfToken();
    expect(a).not.toBe(b);
  });

  it('matches an independently computed base64url encoding for deterministic mocked bytes', () => {
    const deterministicBytes = new Uint8Array(32);
    for (let i = 0; i < deterministicBytes.length; i++) deterministicBytes[i] = i * 7 + 1;

    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((arr: Uint8Array) => {
      arr.set(deterministicBytes);
      return arr;
    }) as typeof globalThis.crypto.getRandomValues);

    const token = generateBuilderCsrfToken();
    spy.mockRestore();

    // Independently computed oracle, deliberately not sharing code with the
    // implementation under test (Node Buffer is fine here — this runs only
    // in the test file, never in the Edge-executed middleware itself).
    const expected = Buffer.from(deterministicBytes).toString('base64url');

    expect(token).toBe(expected);
    expect(token).toHaveLength(43);
  });
});

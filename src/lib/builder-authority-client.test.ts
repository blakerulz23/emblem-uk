import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GENERIC_FAILURE, confirmButtonLabel, isNonGuardianRelationship, postJson } from './builder-authority-client';

/**
 * This repo has no component-rendering test infrastructure (no jsdom, no
 * @testing-library/react) — the same disclosed constraint as card-share.
 * test.ts. The root cause fixed here (a silent, unhandled fetch()
 * rejection with zero UI feedback) lives entirely in postJson, a pure
 * async function independent of React — extracted into this plain .ts
 * module specifically so it can be proven correct without rendering
 * anything. The click-handler wiring around it in AdultPermissionStep.tsx
 * (busyRef guard, <form onSubmit>, error state preservation) was verified
 * by direct code reading, not an automated interaction test.
 */
describe('postJson — the silent-failure fix', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('a genuine network-level fetch() rejection resolves to a visible generic failure, never throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(postJson('/api/builder-authority/declare', { a: 1 })).resolves.toEqual({ ok: false, error: GENERIC_FAILURE });
  });

  it('a non-JSON (e.g. HTML error page) response also resolves to a visible generic failure, never throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    await expect(postJson('/api/builder-authority/declare', {})).resolves.toEqual({ ok: false, error: GENERIC_FAILURE });
  });

  it('an HTTP error with a real server error message surfaces that message, not the generic fallback', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Please verify your email first' }),
    });
    const result = await postJson('/api/builder-authority/declare', {});
    expect(result).toEqual({ ok: false, error: 'Please verify your email first' });
  });

  it('a genuine success response is returned as-is', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, relationship: 'parent_guardian' }),
    });
    const result = await postJson('/api/builder-authority/declare', {});
    expect(result).toEqual({ ok: true, relationship: 'parent_guardian' });
  });

  it('sends the exact body and CSRF header shape callers expect', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    global.fetch = fetchMock;
    await postJson('/api/builder-authority/declare', { relationship: 'coach' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/builder-authority/declare',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ relationship: 'coach' }),
      })
    );
  });
});

describe('isNonGuardianRelationship / confirmButtonLabel', () => {
  it('parent_guardian is the only relationship treated as the guardian themselves', () => {
    expect(isNonGuardianRelationship('parent_guardian')).toBe(false);
    expect(isNonGuardianRelationship('coach')).toBe(true);
    expect(isNonGuardianRelationship('club_organiser')).toBe(true);
    expect(isNonGuardianRelationship('other_adult')).toBe(true);
    expect(isNonGuardianRelationship('')).toBe(false);
  });

  it('button label is "Approve and continue" for a parent/guardian', () => {
    expect(confirmButtonLabel('parent_guardian', false)).toBe('Approve and continue');
  });

  it('button label is "Continue to guardian approval" for every non-guardian relationship', () => {
    expect(confirmButtonLabel('coach', false)).toBe('Continue to guardian approval');
    expect(confirmButtonLabel('club_organiser', false)).toBe('Continue to guardian approval');
    expect(confirmButtonLabel('other_adult', false)).toBe('Continue to guardian approval');
  });

  it('button label shows the busy state regardless of relationship', () => {
    expect(confirmButtonLabel('parent_guardian', true)).toBe('Saving…');
    expect(confirmButtonLabel('coach', true)).toBe('Saving…');
  });
});

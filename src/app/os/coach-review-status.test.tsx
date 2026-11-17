import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall } from '@/lib/fake-supabase.test-support';

const h = vi.hoisted(() => ({
  session: null as null | ReturnType<typeof import('@/lib/fake-supabase.test-support').createFakeSupabase>,
  signOut: null as null | ((...a: unknown[]) => unknown),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }), signOut: (...a: unknown[]) => h.signOut!(...a) } }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.session!.client, createServiceRoleClient: () => h.session!.client }));

import ActivationGate from './overlays/ActivationGate';
import CoachReviewStatusScreen, { signOutFromReviewScreen } from './overlays/CoachReviewStatusScreen';
import { readDeletionReview, showsCoachReviewScreen, signOutToStart } from '@/lib/coach-review-status';
import { COACH_REVIEW_SCREEN_BODY, COACH_REVIEW_SCREEN_PAUSED, COACH_REVIEW_SCREEN_TITLE } from '@/lib/account-deletion-copy';

const UNDER_REVIEW = { underReview: true, coachAccessPaused: true };
const gate = (p: Partial<Parameters<typeof ActivationGate>[0]>) =>
  renderToStaticMarkup(<ActivationGate onActivate={() => {}} hasSession profileRole="coach" view={null} teamRequest={null} {...p} />);

describe('the pending coach-only state (ActivationGate)', () => {
  it('a coach-only account under review sees the status screen with Sign out, not the team-request form', () => {
    const html = gate({ deletionReview: UNDER_REVIEW });
    expect(html).toContain(COACH_REVIEW_SCREEN_TITLE);
    expect(html).toContain('Nothing has been permanently deleted yet.');
    expect(html).toContain('Your coaching access is paused');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Sign out<\/button>/);
    expect(html).not.toContain('Send request');
  });

  it('also with an old approved team request on file', () => {
    const html = gate({ deletionReview: UNDER_REVIEW, teamRequest: { id: 'r1', status: 'approved', clubName: 'FC', teamName: 'U9', ageGroup: null, decisionNote: null, createdAt: '2026-11-01' } as never });
    expect(html).toContain(COACH_REVIEW_SCREEN_TITLE);
    expect(html).not.toContain('Send request');
  });

  it('unchanged when not under review: the coach team-request onboarding as before', () => {
    for (const deletionReview of [null, undefined, { underReview: false, coachAccessPaused: false }]) {
      const html = gate({ deletionReview });
      expect(html).not.toContain(COACH_REVIEW_SCREEN_TITLE);
      expect(html).toContain('Send request');
    }
  });

  it('unchanged for an account with a view (it keeps the app; its Account Settings shows the review)', () => {
    const html = gate({ view: 'parent', profileRole: 'parent', deletionReview: UNDER_REVIEW });
    expect(html).not.toContain(COACH_REVIEW_SCREEN_TITLE);
    expect(html).toContain('Tap to activate');
  });

  it('unchanged for a non-coach account under review with no coach access paused (out of scope)', () => {
    const html = gate({ profileRole: 'parent', deletionReview: { underReview: true, coachAccessPaused: false } });
    expect(html).not.toContain(COACH_REVIEW_SCREEN_TITLE);
  });
});

describe('showsCoachReviewScreen', () => {
  const base = { hasSession: true, view: null, profileRole: 'coach' as const, deletionReview: UNDER_REVIEW };
  it.each([
    ['coach-only, under review, access paused', base, true],
    ['coach role, under review, nothing left to pause', { ...base, deletionReview: { underReview: true, coachAccessPaused: false } }, true],
    ['no role, under review, coach access paused', { ...base, profileRole: null }, true],
    ['signed out', { ...base, hasSession: false }, false],
    ['has a view', { ...base, view: 'coach' as const }, false],
    ['not under review', { ...base, deletionReview: { underReview: false, coachAccessPaused: false } }, false],
    ['review status unknown', { ...base, deletionReview: null }, false],
    ['parent role, under review, nothing paused', { ...base, profileRole: 'parent' as const, deletionReview: { underReview: true, coachAccessPaused: false } }, false],
  ])('%s', (_name, input, expected) => {
    expect(showsCoachReviewScreen(input)).toBe(expected);
  });
});

describe('the status screen', () => {
  it('says what is happening, promises no email, and offers only Sign out', () => {
    const html = renderToStaticMarkup(<CoachReviewStatusScreen />);
    for (const text of [COACH_REVIEW_SCREEN_TITLE, COACH_REVIEW_SCREEN_BODY, COACH_REVIEW_SCREEN_PAUSED]) expect(html).toContain(text);
    expect(html).toContain('role="status"');
    expect(html.match(/<button/g)).toHaveLength(1);
    for (const text of [COACH_REVIEW_SCREEN_TITLE, COACH_REVIEW_SCREEN_BODY, COACH_REVIEW_SCREEN_PAUSED]) {
      expect(text).not.toMatch(/in touch|email you|we'll email|hello@/i);
    }
  });
});

describe('Sign out (back to the signed-out /os start screen)', () => {
  const realWindow = globalThis.window;
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    assign = vi.fn();
    (globalThis as { window?: unknown }).window = { location: { assign } };
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it('ends the Supabase session, then navigates to /os', async () => {
    const order: string[] = [];
    h.signOut = vi.fn(async () => { order.push('signOut'); return { error: null }; });
    assign.mockImplementation((p: string) => order.push(`navigate ${p}`));
    await signOutFromReviewScreen();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['signOut', 'navigate /os']);
  });

  it('still leaves the screen when sign-out reports an error or throws', async () => {
    h.signOut = vi.fn(async () => ({ error: { message: 'network' } }));
    await signOutFromReviewScreen();
    h.signOut = vi.fn(async () => { throw new Error('offline'); });
    await signOutFromReviewScreen();
    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith('/os');
  });

  it('signOutToStart waits for sign-out before navigating', async () => {
    let resolve!: () => void;
    const navigate = vi.fn();
    const p = signOutToStart({ signOut: () => new Promise<void>((r) => { resolve = r; }), navigate });
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    resolve();
    await p;
    expect(navigate).toHaveBeenCalledWith('/os');
  });
});

describe('readDeletionReview', () => {
  const client = (rpc: Parameters<typeof createFakeSupabase>[0]['rpc']) => createFakeSupabase({ user: { id: 'u1' }, rpc });

  it('reads the account’s own status from my_account_deletion_review()', async () => {
    const s = client(() => ({ data: { underReview: true, coachAccessPaused: true } }));
    expect(await readDeletionReview(s.client as never)).toEqual(UNDER_REVIEW);
    expect(s.rpcCalls.map((c) => c.fn)).toEqual(['my_account_deletion_review']);
  });

  it('anything unreadable is unknown (null), which keeps /os as it was', async () => {
    expect(await readDeletionReview(client(() => ({ error: { message: 'function does not exist' } })).client as never)).toBeNull();
    expect(await readDeletionReview(client(() => ({ data: null })).client as never)).toBeNull();
    expect(await readDeletionReview({ rpc: () => Promise.reject(new Error('down')) })).toBeNull();
    expect(await readDeletionReview(client(() => ({ data: { underReview: 'yes' } })).client as never)).toEqual({ underReview: false, coachAccessPaused: false });
  });
});

describe('getOsAccount reads the review only when there is no view', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  const account = (respond: (c: FakeCall) => { data?: unknown; count?: number } | undefined) => {
    h.session = createFakeSupabase({
      user: { id: 'u1', email: 'coach@example.test' },
      respond: (c) => (c.table === 'profiles' ? { data: { role: 'coach' } } : respond(c)),
      rpc: (fn) => (fn === 'my_account_deletion_review' ? { data: { underReview: true, coachAccessPaused: true } } : undefined),
    });
    return h.session;
  };

  it('coach-only account with no access: view null and the review status is returned', async () => {
    const s = account((c) => (c.table === 'coach_team' ? { data: [] } : { count: 0 }));
    const { getOsAccount } = await import('@/lib/os-data');
    const a = await getOsAccount(null);
    expect(a.view).toBeNull();
    expect(a.profileRole).toBe('coach');
    expect(a.deletionReview).toEqual(UNDER_REVIEW);
    expect(s.rpcCalls.map((c) => c.fn)).toEqual(['my_account_deletion_review']);
  });

  it('an account with coach access: the review is not read at all', async () => {
    const s = account((c) => (c.table === 'coach_team' ? { data: [{ team_id: 't1', ended_at: null, expires_at: null }] } : { count: 0 }));
    const { getOsAccount } = await import('@/lib/os-data');
    const a = await getOsAccount(null);
    expect(a.view).toBe('coach');
    expect(a.deletionReview).toBeNull();
    expect(s.rpcCalls).toHaveLength(0);
  });
});

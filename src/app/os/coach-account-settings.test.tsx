import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } }) }));

import CoachSettingsCard from './screens/CoachSettingsCard';
import CoachProfile from './screens/CoachProfile';
import AccountSettings from './overlays/AccountSettings';
import { OsDataProvider } from './OsDataContext';
import { DEMO_OS_DATA, type OsData } from './osData';

const REAL_COACH: OsData = { ...DEMO_OS_DATA, mode: 'real', coachDisplayName: 'Test Coach', coachClub: { name: 'Fictional FC', location: null }, coachTeamsManaged: [{ id: 't1', name: 'U10 Blues', playerCount: 3 }] as OsData['coachTeamsManaged'] };

type Node = { props?: { role?: string; 'aria-label'?: string; onClick?: () => void; children?: unknown } };
function findButton(node: unknown, label: string): Node | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Node;
  if (n.props?.role === 'button' && n.props['aria-label'] === label) return n;
  const kids = n.props?.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const hit = findButton(k, label);
    if (hit) return hit;
  }
  return null;
}

describe('Coach Profile settings (F3)', () => {
  it('real account: Account is a real button that opens Account Settings', () => {
    const onOpenAccount = vi.fn();
    const el = CoachSettingsCard({ isReal: true, onOpenAccount }) as ReactElement;
    const account = findButton(el, 'Open Account Settings');
    expect(account).not.toBeNull();
    account!.props!.onClick!();
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it('real account: no Notifications row that looks tappable but does nothing', () => {
    const html = renderToStaticMarkup(<OsDataProvider value={REAL_COACH}><CoachProfile /></OsDataProvider>);
    expect(html).toContain('aria-label="Open Account Settings"');
    expect(html).not.toContain('Notifications');
  });

  it('demo coach profile keeps its original static rows', () => {
    const html = renderToStaticMarkup(<OsDataProvider value={DEMO_OS_DATA}><CoachProfile /></OsDataProvider>);
    expect(html).toContain('Notifications');
    expect(html).not.toContain('aria-label="Open Account Settings"');
  });
});

describe('Account Settings for a coach-only account', () => {
  const html = renderToStaticMarkup(<AccountSettings audience="coach" onClose={() => {}} />);

  it('offers sign out and delete account (the same flow and route parents use)', () => {
    expect(html).toContain('aria-label="Sign out"');
    expect(html).toContain('aria-label="Delete account"');
    expect(html).toContain('Permanently deletes your Emblem login and your coach access.');
  });

  it('has no player-scoped sections (no player to scope them to)', () => {
    expect(html).not.toContain('Public profile');
    expect(html).not.toContain('Media and privacy');
    expect(html).not.toContain('Request player-data deletion');
    expect(html).not.toContain('guardian login');
  });

  it('the parent version is unchanged (player sections and guardian copy present)', () => {
    const parent = renderToStaticMarkup(
      <AccountSettings playerId="p1" playerName="Sam" publicIdEnabled={false} publicPlayerId={null} onClose={() => {}} onPublicVisibilityChanged={() => {}} />
    );
    expect(parent).toContain('Public profile');
    expect(parent).toContain('Media and privacy');
    expect(parent).toContain('Request player-data deletion');
    expect(parent).toContain('Permanently deletes your guardian login and access.');
    expect(parent).toContain('aria-label="Sign out"');
  });
});

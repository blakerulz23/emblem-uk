import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPublicPlayerProfile } from './public-player-profile';

// Chainable stand-in for the service-role query builder, resolving a fixed
// result per table whether awaited directly or via maybeSingle().
const tableResults: Record<string, unknown> = {};
const selects: Record<string, string> = {};
function chain(table: string): unknown {
  const take = () => Promise.resolve(tableResults[table] ?? { data: null, error: null });
  const proxy: unknown = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => take().then(res, rej);
      if (prop === 'maybeSingle' || prop === 'single') return () => take();
      return (...args: unknown[]) => { if (prop === 'select') selects[table] = String(args[0]); return proxy; };
    },
  });
  return proxy;
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (table: string) => chain(table) }) }));
vi.mock('@/lib/s3-client', () => ({ getSignedDownloadUrl: vi.fn().mockResolvedValue('https://signed.example.test/x') }));
vi.mock('@/lib/card-definition-logo', () => ({ resolveCardDefinitionLogo: vi.fn().mockResolvedValue(null) }));

const PLAYER = {
  id: 'p1', name: 'Synthetic Player', position: null, secondary_position: null, squad_number: null, photo_key: null,
  public_id_enabled: true, teams: null,
};

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  tableResults.players = { data: PLAYER, error: null };
  tableResults.card_definitions = { data: null, error: null };
});

describe('getPublicPlayerProfile — moment notes', () => {
  it("never publishes a coach's recognition message, but keeps a guardian's own note", async () => {
    tableResults.moments = {
      data: [
        { id: 'm1', title: 'Man of the Match', occurred_on: null, note: 'private words from the coach', trust: 'coach', verification_status: 'coach_verified', moment_media: [] },
        { id: 'm2', title: 'First goal', occurred_on: null, note: 'our own family note', trust: 'parent', verification_status: 'coach_verified', moment_media: [] },
        { id: 'm3', title: 'Card created', occurred_on: null, note: 'system text', trust: 'club', verification_status: 'coach_verified', moment_media: [] },
      ],
      error: null,
    };
    const result = await getPublicPlayerProfile('PUB123');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.moments.map((m) => m.note)).toEqual([null, 'our own family note', null]);
    expect(JSON.stringify(result)).not.toContain('private words from the coach');
    expect(selects.moments).toContain('trust');
  });
});

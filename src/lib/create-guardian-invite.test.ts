import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './fake-supabase.test-support';
import type { FakeResult } from './fake-supabase.test-support';
import { createGuardianInvite, GUARDIAN_INVITE_DENIED_MESSAGE, GUARDIAN_INVITE_FAILED_MESSAGE } from './create-guardian-invite';

const sendInviteEmail = vi.fn();
vi.mock('@/lib/send-invite-email', () => ({ sendInviteEmail: (...args: unknown[]) => sendInviteEmail(...args) }));

const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const EMAIL = 'parent@example.test';

function db({ existing = null as unknown, insert = undefined as FakeResult | undefined } = {}) {
  return createFakeSupabase({
    respond: (c) => {
      if (c.table !== 'player_invites') return {};
      if (c.op === 'select') return { data: existing };
      if (c.op === 'insert') return insert ?? { data: { id: 'invite-1', code: (c.payload as { code: string }).code } };
      return {};
    },
  });
}
const inserts = (fake: ReturnType<typeof db>) => fake.calls.filter((c) => c.table === 'player_invites' && c.op === 'insert');
const statusWrites = (fake: ReturnType<typeof db>) =>
  fake.calls.filter((c) => c.table === 'player_invites' && c.op === 'update').map((c) => (c.payload as { email_status: string }).email_status);

let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  sendInviteEmail.mockReset();
  logs = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
});
afterEach(() => logs.forEach((l) => l.mockRestore()));
const allLogs = () => JSON.stringify(logs.map((l) => l.mock.calls));

describe('createGuardianInvite — the invite and its email are separate outcomes', () => {
  it('confirmed delivery: emailStatus "sent", recorded as sent', async () => {
    sendInviteEmail.mockResolvedValue({ ok: true });
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r).toMatchObject({ ok: true, reused: false, emailStatus: 'sent' });
    expect(statusWrites(fake)).toEqual(['sent']);
  });

  it('email not configured: the invite is still created and usable, emailStatus "failed"', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emailStatus).toBe('failed');
    expect(r.code).toMatch(/\S/);
    expect(inserts(fake)).toHaveLength(1);
    expect(statusWrites(fake)).toEqual(['failed']);
  });

  it('provider failure: the invite is not rolled back, emailStatus "failed"', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'provider_rejected' });
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r).toMatchObject({ ok: true, emailStatus: 'failed' });
    expect(fake.calls.some((c) => c.table === 'player_invites' && c.op === 'delete')).toBe(false);
  });

  it('a link-only invite (no address) sends nothing: "skipped_no_email"', async () => {
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, undefined);
    expect(r).toMatchObject({ ok: true, emailStatus: 'skipped_no_email' });
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it('retry: reuses the existing invite (no duplicate) and tries the email again', async () => {
    sendInviteEmail.mockResolvedValue({ ok: true });
    const fake = db({ existing: { id: 'invite-1', code: 'EXISTING-CODE' } });
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r).toEqual({ ok: true, code: 'EXISTING-CODE', reused: true, emailStatus: 'sent' });
    expect(inserts(fake)).toHaveLength(0);
    expect(sendInviteEmail).toHaveBeenCalledWith(EMAIL, 'EXISTING-CODE');
  });

  it('a retry whose email fails again still reports it truthfully', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'network_error' });
    const fake = db({ existing: { id: 'invite-1', code: 'EXISTING-CODE' } });
    expect(await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL)).toMatchObject({ ok: true, reused: true, emailStatus: 'failed' });
    expect(inserts(fake)).toHaveLength(0);
  });

  it('an RLS refusal (not this player\'s guardian or coach) is a clean 403, and no email is attempted', async () => {
    const fake = db({ insert: { error: { code: '42501', message: 'new row violates row-level security policy for table "player_invites"' } } });
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r).toEqual({ ok: false, status: 403, error: GUARDIAN_INVITE_DENIED_MESSAGE });
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it('a database failure is a generic 500: no database text, and only the error code is logged', async () => {
    const fake = db({ insert: { error: { code: '08006', message: 'connection reset by peer' } } });
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    expect(r).toEqual({ ok: false, status: 500, error: GUARDIAN_INVITE_FAILED_MESSAGE });
    expect(sendInviteEmail).not.toHaveBeenCalled();
    expect(allLogs()).toContain('08006');
    expect(allLogs()).not.toContain('connection reset');
  });

  it('never logs the invite code or the address', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'provider_rejected' });
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL);
    if (!r.ok) throw new Error('expected an invite');
    expect(allLogs()).not.toContain(r.code);
    expect(allLogs()).not.toContain(EMAIL);
  });
});

// 0090 grants a signed-in user INSERT on exactly these five player_invites
// columns. PostgreSQL needs the privilege for every column an insert lists,
// even a null one, so the signed-in path must not list order_id at all.
const SIGNED_IN_COLUMNS = ['code', 'created_by', 'invited_email', 'origin', 'player_id'];
const ORDER = 'dddddddd-0000-4000-8000-000000000004';

describe('createGuardianInvite — insert columns (0090 guardian-invite write lockdown)', () => {
  it('the ordinary guardian or active-coach path sends exactly the five approved columns', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const fake = db();
    await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL, 'coach_added_player');
    const [insert] = inserts(fake);
    expect(Object.keys(insert.payload as object).sort()).toEqual(SIGNED_IN_COLUMNS);
    expect(insert.payload).toMatchObject({ player_id: PLAYER, created_by: USER, invited_email: EMAIL, origin: 'coach_added_player' });
  });

  it('it never sends order_id: null (absent, not null), for link-only and default-origin invites too', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'not_configured' });
    for (const email of [EMAIL, undefined]) {
      const fake = db();
      await createGuardianInvite(fake.client as never, PLAYER, USER, email);
      const payload = inserts(fake)[0].payload as Record<string, unknown>;
      expect('order_id' in payload).toBe(false);
      expect(Object.keys(payload).sort()).toEqual(SIGNED_IN_COLUMNS);
    }
    const fake = db();
    await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL, 'second_guardian', null as unknown as string);
    expect('order_id' in (inserts(fake)[0].payload as object)).toBe(false);
  });

  it('a trusted caller with a genuine order includes order_id (and nothing else changes)', async () => {
    sendInviteEmail.mockResolvedValue({ ok: true });
    const fake = db();
    const r = await createGuardianInvite(fake.client as never, PLAYER, null, EMAIL, 'order_approval', ORDER);
    expect(r).toMatchObject({ ok: true, reused: false, emailStatus: 'sent' });
    const payload = inserts(fake)[0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([...SIGNED_IN_COLUMNS, 'order_id'].sort());
    expect(payload).toMatchObject({ order_id: ORDER, origin: 'order_approval', created_by: null });
    // The order-approval reuse lookup is still scoped to that order.
    const lookup = fake.calls.find((c) => c.table === 'player_invites' && c.op === 'select');
    expect(lookup?.filters).toContainEqual(['eq', 'order_id', ORDER]);
  });

  it('Gate 3.9: a signed-in caller only ever reuses invites with no order, so it is never handed a trusted invite', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const fake = db();
    await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL, 'second_guardian');
    const lookup = fake.calls.find((c) => c.table === 'player_invites' && c.op === 'select');
    expect(lookup?.filters).toContainEqual(['is', 'order_id', null]);
  });

  it('Gate 3.9: a trusted recovery handoff carries the card\'s order and reuses only an invite for that order', async () => {
    sendInviteEmail.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const fake = db();
    await createGuardianInvite(fake.client as never, PLAYER, USER, EMAIL, 'second_guardian', ORDER);
    const lookup = fake.calls.find((c) => c.table === 'player_invites' && c.op === 'select');
    expect(lookup?.filters).toContainEqual(['eq', 'order_id', ORDER]);
    expect(inserts(fake)[0].payload).toMatchObject({ order_id: ORDER, origin: 'second_guardian', created_by: USER, invited_email: EMAIL });
  });
});

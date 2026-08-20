import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockIsMvpEnabled = vi.fn();
vi.mock('@/lib/squad-invite-mvp', () => ({ isSquadInviteMvpEnabled: () => mockIsMvpEnabled() }));

const mockRequirePermission = vi.fn();
vi.mock('@/lib/require-squad-invite-permission', () => ({
  requireSquadInvitePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockCreateLinkToken = vi.fn();
vi.mock('@/lib/squad-invite-link', () => ({
  createSquadInviteLinkToken: (...args: unknown[]) => mockCreateLinkToken(...args),
}));

const mockDispatchNotification = vi.fn();
vi.mock('@/lib/dispatch-squad-invite-notification', () => ({
  dispatchSquadInviteNotification: (...args: unknown[]) => mockDispatchNotification(...args),
}));

const mockRpc = vi.fn();
const mockRequestRow = { data: { club_team_name: 'Ashton Juniors U10', public_reference: 'SI-ABC123', organiser_email: 'organiser@example.test' } };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'squad_invite_requests') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => mockRequestRow }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const REQUEST_ID = 'request-1';
const ORIGINAL_ENV = { ...process.env };

function approve() {
  return POST(new NextRequest(`http://localhost/api/staff/squad-invites/${REQUEST_ID}/approve`, { method: 'POST' }), { params: { id: REQUEST_ID } });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SQUAD_INVITE_GRACE_HOURS;
  mockIsMvpEnabled.mockReset();
  mockRequirePermission.mockReset();
  mockCreateLinkToken.mockReset();
  mockDispatchNotification.mockReset();
  mockRpc.mockReset();

  mockIsMvpEnabled.mockReturnValue(true);
  mockRequirePermission.mockResolvedValue({ ok: true, userId: 'staff-1' });
  mockCreateLinkToken.mockReturnValue({ hash: 'a'.repeat(64), token: 'raw-token' });
  mockRpc.mockResolvedValue({ data: { created: true, requestId: REQUEST_ID, campaignId: 'campaign-1', status: 'approved_setup_required' }, error: null });
  mockDispatchNotification.mockResolvedValue(undefined);
});

describe('POST /api/staff/squad-invites/[id]/approve — access gates (unchanged)', () => {
  it('returns 404 when the MVP flag is off', async () => {
    mockIsMvpEnabled.mockReturnValue(false);
    const res = await approve();
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('requires Approver permission', async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, status: 403, error: 'Squad Invite permission required' });
    const res = await approve();
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces an RPC failure as a 409', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'request is not approvable' } });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it('dispatches the organiser notification and returns the RPC result on success', async () => {
    const res = await approve();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, result: { created: true, requestId: REQUEST_ID, campaignId: 'campaign-1', status: 'approved_setup_required' } });
    expect(mockDispatchNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      requestId: REQUEST_ID, eventKey: 'approval:v1', template: 'approved_link_ready',
      teamName: 'Ashton Juniors U10', publicReference: 'SI-ABC123', toEmail: 'organiser@example.test',
    }));
  });
});

describe('POST /api/staff/squad-invites/[id]/approve — SQUAD_INVITE_GRACE_HOURS', () => {
  it('passes p_grace_hours: 24 when the env var is unset — matches production today exactly', async () => {
    await approve();
    expect(mockRpc).toHaveBeenCalledWith('approve_squad_invite_request', expect.objectContaining({ p_grace_hours: 24 }));
  });

  it('passes the env var through exactly when it is a valid number', async () => {
    process.env.SQUAD_INVITE_GRACE_HOURS = '1';
    await approve();
    expect(mockRpc).toHaveBeenCalledWith('approve_squad_invite_request', expect.objectContaining({ p_grace_hours: 1 }));
  });

  it('falls back to 24 for a non-numeric env var, never NaN or the raw string', async () => {
    process.env.SQUAD_INVITE_GRACE_HOURS = 'not-a-number';
    await approve();
    const call = mockRpc.mock.calls[0][1] as { p_grace_hours: unknown };
    expect(call.p_grace_hours).toBe(24);
    expect(Number.isNaN(call.p_grace_hours)).toBe(false);
  });

  it('falls back to 24 for an out-of-range env var (0, negative, or absurdly large)', async () => {
    for (const value of ['0', '-5', '10000']) {
      mockRpc.mockClear();
      process.env.SQUAD_INVITE_GRACE_HOURS = value;
      await approve();
      expect(mockRpc).toHaveBeenCalledWith('approve_squad_invite_request', expect.objectContaining({ p_grace_hours: 24 }));
    }
  });

  it('still includes every other existing RPC argument unchanged alongside p_grace_hours', async () => {
    await approve();
    expect(mockRpc).toHaveBeenCalledWith('approve_squad_invite_request', {
      p_request_id: REQUEST_ID,
      p_staff_profile_id: 'staff-1',
      p_parent_link_hash: 'a'.repeat(64),
      p_grace_hours: 24,
    });
  });
});

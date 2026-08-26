import { createHmac } from 'crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockRpc = vi.fn();
const mockOrdersSelect = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      if (table === 'orders') {
        return { select: () => ({ eq: (col: string, val: unknown) => ({ maybeSingle: () => mockOrdersSelect(col, val) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const SECRET = 'test-webhook-secret';
const WEBHOOK_ID = 'whid_refund_1';

function sign(body: string) {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
}

function post(payload: unknown, opts: { skipSignature?: boolean; skipWebhookId?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (!opts.skipSignature) headers['x-shopify-hmac-sha256'] = sign(body);
  if (!opts.skipWebhookId) headers['x-shopify-webhook-id'] = WEBHOOK_ID;
  return POST(new NextRequest('http://localhost/api/webhooks/shopify/refunds-create', { method: 'POST', body, headers }));
}

const PAYLOAD = { id: 42, order_id: 987654321 };

beforeEach(() => {
  process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
  mockRpc.mockReset();
  mockOrdersSelect.mockReset();
  mockOrdersSelect.mockResolvedValue({ data: { id: 'order-9' }, error: null });
  mockRpc.mockResolvedValue({ data: { applied: true }, error: null });
});

describe('POST /api/webhooks/shopify/refunds-create', () => {
  it('rejects an invalid/missing signature before any lookup', async () => {
    const res = await post(PAYLOAD, { skipSignature: true });
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a missing webhook delivery id', async () => {
    const res = await post(PAYLOAD, { skipWebhookId: true });
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('200s harmlessly with no order_id in the payload', async () => {
    const res = await post({ id: 1 });
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('looks the order up by shopify_order_id, never by order_ref — a Refund payload has no note_attributes at all', async () => {
    await post(PAYLOAD);
    expect(mockOrdersSelect).toHaveBeenCalledWith('shopify_order_id', '987654321');
  });

  it('200s harmlessly with no matching order (a refund on an order this system never recorded paid)', async () => {
    mockOrdersSelect.mockResolvedValue({ data: null, error: null });
    const res = await post(PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('applies via apply_gate3_payment_event with to_status refunded and the webhook id as the idempotency key', async () => {
    const res = await post(PAYLOAD);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('apply_gate3_payment_event', {
      p_order_id: 'order-9',
      p_shopify_event_id: WEBHOOK_ID,
      p_topic: 'refunds/create',
      p_to_status: 'refunded',
      p_shopify_order_id: '987654321',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { submitRecognition } from './recognition-submit';

const PAYLOAD = { playerId: '30000000-0000-4000-8000-000000000001', award: 'Man of the Match', message: 'Brilliant today' };
const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('submitRecognition', () => {
  it('is saved only when the server confirms with a moment id', async () => {
    const fetchImpl = respond(200, { ok: true, momentId: 'moment-1' });
    expect(await submitRecognition(fetchImpl, PAYLOAD)).toBe('saved');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/os/celebrate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
  });

  it('counts a deduplicated retry as saved', async () => {
    expect(await submitRecognition(respond(200, { ok: true, momentId: 'moment-1', duplicate: true }), PAYLOAD)).toBe('saved');
  });

  it('fails on a server error, so the UI never shows "Recognition added"', async () => {
    expect(await submitRecognition(respond(500, { error: 'Could not send recognition' }), PAYLOAD)).toBe('failed');
    expect(await submitRecognition(respond(403, { error: 'Forbidden' }), PAYLOAD)).toBe('failed');
  });

  it('fails on a network error', async () => {
    expect(await submitRecognition(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), PAYLOAD)).toBe('failed');
  });

  it('fails on a 2xx without a confirmed moment id', async () => {
    expect(await submitRecognition(respond(200, 'not json'), PAYLOAD)).toBe('failed');
    expect(await submitRecognition(respond(200, { ok: true }), PAYLOAD)).toBe('failed');
  });
});

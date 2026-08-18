import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInvitePaymentRequestEmail } from './send-squad-invite-payment-request-email';

const ORIGINAL_ENV = { ...process.env };

describe('sendSquadInvitePaymentRequestEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: 'Test FC', paymentUrl: 'https://example.com/cart/1:1', unitPricePence: 1899, printQuantity: 1,
    });
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('includes the payment link and single-item price', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; subject?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: 'Test FC', paymentUrl: 'https://shop.example.com/cart/123:1?attributes',
      unitPricePence: 1899, printQuantity: 1,
    });
    expect(capturedBody.html).toContain('https://shop.example.com/cart/123:1?attributes');
    expect(capturedBody.html).toContain('£18.99');
    expect(capturedBody.subject).toContain('Test FC');
  });

  it('shows a per-card and total price when more than one copy is ordered', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: 'Test FC', paymentUrl: 'https://shop.example.com/cart/123:3',
      unitPricePence: 1899, printQuantity: 3,
    });
    expect(capturedBody.html).toContain('£18.99 per card × 3 = £56.97');
  });

  it('escapes the team name before embedding it in the email body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: '<script>alert(1)</script>', paymentUrl: 'https://shop.example.com/cart/1:1',
      unitPricePence: 1899, printQuantity: 1,
    });
    expect(capturedBody.html).not.toContain('<script>alert(1)</script>');
    expect(capturedBody.html).toContain('&lt;script&gt;');
  });

  it('returns ok:false, never throws, when the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const result = await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: 'Test FC', paymentUrl: 'https://shop.example.com/cart/1:1', unitPricePence: 1899, printQuantity: 1,
    });
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false, never throws, when fetch itself throws (network failure)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await sendSquadInvitePaymentRequestEmail({
      toEmail: 'parent@example.org', teamName: 'Test FC', paymentUrl: 'https://shop.example.com/cart/1:1', unitPricePence: 1899, printQuantity: 1,
    });
    expect(result).toEqual({ ok: false });
  });
});

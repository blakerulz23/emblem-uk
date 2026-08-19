import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInvitePricingConfirmedEmail } from './send-squad-invite-pricing-confirmed-email';

const ORIGINAL_ENV = { ...process.env };

const SQUAD_PARAMS = {
  toEmail: 'guardian@example.org',
  teamName: 'Ashton Juniors U10',
  committedCount: 12,
  unitPricePence: 1899,
  tier: 'squad' as const,
  claimUrl: 'https://emblem-uk.example/os?card=abc123',
};

const SINGLE_PARAMS = {
  ...SQUAD_PARAMS,
  committedCount: 1,
  unitPricePence: 2499,
  tier: 'single' as const,
};

describe('sendSquadInvitePricingConfirmedEmail', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('no-ops safely (never throws) when RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends both HTML and text bodies, and the claim URL appears in both', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    const result = await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(result).toEqual({ ok: true });
    expect(capturedBody.subject).toContain('Ashton Juniors U10');
    expect(capturedBody.html).toContain('https://emblem-uk.example/os?card=abc123');
    expect(capturedBody.text).toContain('https://emblem-uk.example/os?card=abc123');
    expect((capturedBody.text ?? '').length).toBeGreaterThan(0);
  });

  it('reads the price from params, never a hardcoded value — subject and body reflect the exact unitPricePence passed in', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail({ ...SQUAD_PARAMS, unitPricePence: 2150 });
    const raw = `${capturedBody.subject} ${capturedBody.html} ${capturedBody.text}`;
    expect(raw).toContain('£21.50');
    expect(raw).not.toContain('£18.99');
  });

  it('squad/multi tier: states the committed count and frames it as a reward for committing early', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(capturedBody.html).toContain('12 players');
    expect(capturedBody.html).toMatch(/committed early/i);
    expect(capturedBody.html).toMatch(/less than ordering on your own/i);
    expect(capturedBody.text).toMatch(/committed early/i);
  });

  it("single tier: never says the team finished with 1 player — orders are closed, nothing to act on, not a penalty", async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SINGLE_PARAMS);
    const raw = `${capturedBody.html} ${capturedBody.text}`;
    expect(raw).not.toMatch(/finished with 1 player/i);
    expect(raw).not.toMatch(/1 players/i);
    expect(raw).toMatch(/orders.*(are )?now closed/i);
    expect(raw).toContain('£24.99');
  });

  it('never mentions paying now, a payment link, or a deadline to pay — this is a price confirmation, not a bill', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    const raw = `${capturedBody.subject} ${capturedBody.html} ${capturedBody.text}`;
    expect(raw).not.toMatch(/pay now|complete payment|payment link|deadline|due (by|within)|expires? in|hours? to (pay|act)/i);
    expect(raw).toMatch(/no payment has been taken/i);
  });

  it('never says "tap to activate" — reserved for the physical claim-reminder email', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    const raw = `${capturedBody.subject} ${capturedBody.html} ${capturedBody.text}`;
    expect(raw).not.toMatch(/tap to activate|card is ready/i);
  });

  it("the card link is a plain pointer, not a styled call-to-action button like the sibling emails use", async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(capturedBody.html).toContain("See your child's card");
    // The sibling CTA-button style (background colour + padding + border-radius
    // on the <a> itself) must not appear here — this link stays plain text.
    expect(capturedBody.html).not.toMatch(/display:\s*inline-block/);
    expect(capturedBody.html).not.toMatch(/background:\s*#E97435/);
    expect(capturedBody.html).not.toMatch(/padding:\s*12px/);
  });

  it('escapes the team name before embedding it in the HTML body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail({ ...SQUAD_PARAMS, teamName: '<script>alert(1)</script>' });
    expect(capturedBody.html).not.toContain('<script>alert(1)</script>');
    expect(capturedBody.html).toContain('&lt;script&gt;');
  });

  it('returns ok:false, never throws, when the Resend API call fails', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));
    const result = await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false, never throws, when fetch itself throws (network failure)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(result).toEqual({ ok: false });
  });
});

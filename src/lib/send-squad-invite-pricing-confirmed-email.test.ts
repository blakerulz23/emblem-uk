import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSquadInvitePricingConfirmedEmail } from './send-squad-invite-pricing-confirmed-email';

const ORIGINAL_ENV = { ...process.env };

const SQUAD_PARAMS = {
  toEmail: 'guardian@example.org',
  teamName: 'Ashton Juniors U10',
  committedCount: 12,
  unitPricePence: 1899,
  tier: 'squad' as const,
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

  it('sends both HTML and text bodies', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { subject?: string; html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    const result = await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    expect(result).toEqual({ ok: true });
    expect(capturedBody.subject).toContain('Ashton Juniors U10');
    expect((capturedBody.html ?? '').length).toBeGreaterThan(0);
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

  it('squad/multi tier: frames it as a static group-vs-solo price comparison, never as a price that changed or "came down"', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    const raw = `${capturedBody.html} ${capturedBody.text}`;
    expect(capturedBody.html).toContain('12 of you');
    expect(capturedBody.html).toMatch(/ordered together/i);
    expect(capturedBody.html).toMatch(/less than ordering alone/i);
    expect(capturedBody.text).toMatch(/ordered together/i);
    expect(raw).not.toMatch(/came down|dropped|fell|lower(ed)? (from|to)/i);
  });

  it('computes the savings against SINGLE_UNIT_PRICE_PENCE at runtime rather than a hardcoded figure', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    // SINGLE_UNIT_PRICE_PENCE is 2499 (see pricing-engine.ts); at 2199 the
    // saving must read as exactly £3.00, derived from the constant, not
    // written anywhere as a literal.
    await sendSquadInvitePricingConfirmedEmail({ ...SQUAD_PARAMS, tier: 'multi', unitPricePence: 2199 });
    expect(capturedBody.html).toContain('£3.00');
    expect(capturedBody.html).toMatch(/£3\.00<\/strong> less than ordering alone/);
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

  it("never links to /os or 'See your child's card' — that link only resolves once the order is fulfilled (card-lookup.ts), which is never true yet when this email sends; the correctly-timed equivalent is sendSquadInviteEarlyPreviewEmail, fired later at staff approval", async () => {
    process.env.RESEND_API_KEY = 'test-key';
    let capturedBody: { html?: string; text?: string } = {};
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String((init as RequestInit).body));
      return new Response(JSON.stringify({ id: 'test' }), { status: 200 });
    });
    await sendSquadInvitePricingConfirmedEmail(SQUAD_PARAMS);
    const raw = `${capturedBody.html} ${capturedBody.text}`;
    expect(raw).not.toContain('/os?card=');
    expect(raw).not.toMatch(/see your child'?s card/i);
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

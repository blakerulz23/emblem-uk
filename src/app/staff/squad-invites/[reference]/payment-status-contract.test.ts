import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/staff/squad-invites/[reference]/page.tsx', 'utf8');

// Guards the "staff decides manually" payment-window decision: nothing here
// may auto-cancel, auto-extend or auto-expire an overdue payment request —
// this section only surfaces one so a human can act on it. Also guards the
// same "staff never sees a child field" rule every other staff route in
// this codebase is tested for (see squad-invite-aggregate-projection-
// contract.test.ts), which doesn't scan this file since it's a page, not
// an API route.
describe('Staff request detail — payment status is visible, never automated, never a child field', () => {
  it('selects only payment/print fields from squad_invite_participations — never a display/child field', () => {
    const select = source.match(/squad_invite_participations['"]\)\.select\('([^']+)'\)/)?.[1] ?? '';
    expect(select).toBe('payment_request_status,payment_deadline_at,print_quantity');
    expect(select).not.toMatch(/display_first_name|display_surname_initial|guardian|email|photo/);
  });

  it('computes "overdue" from payment_request_status and payment_deadline_at only, never writes anything back', () => {
    expect(source).toContain("p.payment_request_status==='issued'&&p.payment_deadline_at&&new Date(p.payment_deadline_at)<now");
    // No update/rpc call anywhere near the payment-status section — this
    // whole page must stay read-only for payment state, matching "nothing
    // happens automatically."
    expect(source).not.toMatch(/\.rpc\('issue_squad_invite_payment_request'/);
    expect(source).not.toMatch(/squad_invite_participations['"]\)\.update\(/);
  });

  it('states explicitly that nothing here is automatic', () => {
    expect(source).toContain('Nothing happens automatically');
  });

  it('the payment-status section only renders once a campaign exists', () => {
    expect(source).toContain('{r.campaign_id&&<section');
  });

  it('participants are labelled only by position, never by an identifying string', () => {
    expect(source).toContain('Participant {i+1}');
  });
});

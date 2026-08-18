import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/app/staff/queue/page.tsx');
const approveButton = read('src/app/staff/queue/ApproveOrderButton.tsx');

describe('Staff queue — Squad Invite orders are clearly labeled, never silently mixed in', () => {
  it('selects orders.source in both the pending-approval query and its fallback', () => {
    const selects = page.match(/\.select\('id, order_ref, purchaser_email, payment_status[^']*'\)/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const select of selects) expect(select).toContain('source');
  });

  it('selects orders.source for the recently-approved section too', () => {
    expect(page).toMatch(/\.select\('id, order_ref, purchaser_email, intended_guardian_email, approved_at, club_name, team_name, source'\)/);
  });

  it('renders a visible "Squad Invite · payment disabled" badge in every section, including the Profile Setup Queue', () => {
    // 2 in the pending/recently-approved sections + 2 in the Profile Setup
    // Queue (Waiting for Setup and Ready for Programming) — added so
    // whoever writes a physical NFC chip can tell a Squad Invite card
    // needs the organiser's consolidated batch, not individual dispatch.
    const badgeCount = (page.match(/Squad Invite · payment disabled/g) ?? []).length;
    expect(badgeCount).toBe(4);
  });

  it('the Profile Setup Queue selects orders.source so its cards can be labelled too', () => {
    expect(page).toContain("select('id, order_ref, purchaser_email, print_files, source')");
    expect(page).toContain('isSquadInvite: order?.source === \'squad_invite\'');
  });

  it('passes squadInvite down to ApproveOrderButton based on orders.source', () => {
    expect(page).toContain("squadInvite={order.source === 'squad_invite'}");
  });

  it('the approve button clearly states what it does for a pilot order — never implies payment', () => {
    expect(approveButton).toContain('Approve for pilot production');
    expect(approveButton).not.toMatch(/approve payment|payment received/i);
  });

  it('never offers a Resend-invitation action for a Squad Invite order — none was ever sent', () => {
    expect(page).toContain("order.source !== 'squad_invite' && <ResendInviteButton");
  });
});

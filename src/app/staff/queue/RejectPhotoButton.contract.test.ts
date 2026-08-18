import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const buttonSource = readFileSync('src/app/staff/queue/RejectPhotoButton.tsx', 'utf8');
const pageSource = readFileSync('src/app/staff/queue/page.tsx', 'utf8');

describe('RejectPhotoButton — two-step confirm, Squad Invite orders only, gone once already rejected', () => {
  it('is a two-step arm/confirm control, not a single click', () => {
    expect(buttonSource).toContain('const [confirming, setConfirming] = useState(false);');
    expect(buttonSource).toContain('setConfirming(true)');
    expect(buttonSource).toContain('setConfirming(false)');
  });

  it('posts an optional reason to the per-order route', () => {
    expect(buttonSource).toContain('fetch(`/api/orders/${orderId}/reject-photo`, {');
    expect(buttonSource).toContain("body: JSON.stringify({ reason: reason.trim() || undefined })");
  });

  it('has an accessible busy state and surfaces server errors', () => {
    expect(buttonSource).toContain('aria-busy={busy}');
    expect(buttonSource).toContain("role=\"alert\"");
  });

  it('is rendered only for Squad Invite orders, and disappears once the photo is already rejected', () => {
    const rejectButtonGate = pageSource.match(/\{order\.source === 'squad_invite' && order\.designPreview\?\.photoStatus !== 'rejected' && \(\s*<RejectPhotoButton orderId=\{order\.id\} \/>/);
    expect(rejectButtonGate).not.toBeNull();
  });

  it('hides the approve button(s) once the photo is rejected — never approvable from a stale row', () => {
    const approveGate = pageSource.match(/\{order\.designPreview\?\.photoStatus !== 'rejected' && \(\s*order\.cardCount > 1 \? \(/);
    expect(approveGate).not.toBeNull();
  });

  it('shows a rejected-photo badge sourced from card_definitions.status, not a separate flag', () => {
    expect(pageSource).toContain("order.designPreview?.photoStatus === 'rejected'");
    expect(pageSource).toContain('Photo rejected — contact guardian');
  });

  it('the design preview query selects status so the badge/button can react to it', () => {
    expect(pageSource).toContain(".select('order_id, name, number, team, position, photo, status')");
  });
});

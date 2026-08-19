import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const buttonSource = readFileSync('src/app/staff/queue/SendClaimReminderButton.tsx', 'utf8');
const pageSource = readFileSync('src/app/staff/queue/page.tsx', 'utf8');

describe('SendClaimReminderButton — manual, Squad Invite cards only, never for an already-claimed card', () => {
  it('posts to the per-card route and prevents a double submission', () => {
    expect(buttonSource).toContain('fetch(`/api/staff/cards/${cardId}/send-claim-reminder`, { method: \'POST\' })');
    expect(buttonSource).toContain('if (pending) return;');
  });

  it('labels itself Resend once already sent, and shows when', () => {
    expect(buttonSource).toContain("alreadySentAt ? 'Resend claim reminder' : 'Send claim reminder'");
    expect(buttonSource).toContain('Last sent');
  });

  it('has an accessible busy state and announces its result', () => {
    expect(buttonSource).toContain('aria-busy={pending}');
    expect(buttonSource).toContain("role={messageIsError ? 'alert' : 'status'}");
  });

  it('handles a quiet already-claimed skip without claiming an email was sent, and without refreshing on nothing changed', () => {
    expect(buttonSource).toContain("body?.skipped === 'already_claimed'");
    const skipBranch = buttonSource.slice(
      buttonSource.indexOf("body?.skipped === 'already_claimed'"),
      buttonSource.indexOf('setMessage(\'Reminder sent.\')')
    );
    expect(skipBranch).not.toMatch(/reminder sent/i);
    expect(skipBranch).not.toContain('router.refresh()');
  });

  it('is rendered in both Profile Setup Queue sections, gated on Squad Invite and not-yet-claimed', () => {
    const occurrences = pageSource.split("c.isSquadInvite && c.status !== 'claimed' && <SendClaimReminderButton").length - 1;
    expect(occurrences).toBe(2);
  });

  it('the staff queue selects status and claim_reminder_sent_at so the button can render correctly', () => {
    expect(pageSource).toContain('claim_token, status, production_status, production_submitted_at, created_at, player_id, claim_reminder_sent_at');
  });
});

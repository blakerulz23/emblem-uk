import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/orders/[id]/reject-photo/route.ts', 'utf8');

describe('POST /api/orders/[id]/reject-photo', () => {
  it('requires generic staff (requireStaff), the same tier as order approval — no new permission concept', () => {
    expect(source).toContain('requireStaff(supabase)');
    expect(source).not.toContain('requireSquadInvitePermission');
  });

  it('delegates all the real logic to the reject_squad_invite_card_photo RPC, passing the staff profile id and an optional reason', () => {
    expect(source).toContain("serviceRole.rpc('reject_squad_invite_card_photo'");
    expect(source).toContain('p_staff_profile_id: staffCheck.userId');
    expect(source).toContain('p_reason: reason');
  });

  it('treats a blank/whitespace-only reason as no reason, never an empty string', () => {
    expect(source).toContain('body.reason.trim().length > 0 ? body.reason.trim() : null');
  });

  it('maps RPC failure to an HTTP error rather than throwing', () => {
    expect(source).toContain('if (error)');
    expect(source).toContain('NextResponse.json({ error: message }, { status });');
  });
});

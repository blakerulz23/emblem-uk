import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkGiftFirstGuardianClaim,
  checkGiftOrderInviteRedemption,
  chooseProfileInviteRecipient,
  isGiftAuthorityStatus,
  resolveProfileInviteRecipient,
  retireOtherOrderApprovalInvites,
} from './gift-order-guardian';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Minimal in-memory PostgREST stand-in: enough of select/eq/in/is/not/
 * order/limit/maybeSingle/update for this module, filtering real rows so
 * the tests exercise the actual lookups rather than canned answers.
 */
function fakeService(tables: Tables, failTables: string[] = []) {
  const updates: Array<{ table: string; patch: Row; ids: unknown[] }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let limit = Infinity;
      let patch: Row | null = null;
      const run = () => {
        if (failTables.includes(table)) return { data: null, error: { message: 'boom' } };
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
        if (patch) {
          rows.forEach((r) => Object.assign(r, patch));
          updates.push({ table, patch, ids: rows.map((r) => r.id) });
          return { data: null, error: null };
        }
        return { data: rows, error: null };
      };
      const q = {
        select: () => q,
        update: (p: Row) => { patch = p; return q; },
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
        not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; },
        order: () => q,
        limit: (n: number) => { limit = n; return q; },
        maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

const CONFIRMED = '2026-11-08T00:00:00Z';
const guardian = { email: 'Guardian@Example.test', email_confirmed_at: CONFIRMED };
const buyer = { email: 'grandparent@example.test', email_confirmed_at: CONFIRMED };

function giftWorld(status: string, opts: { approvedEmail?: string | null; extraChild?: boolean; guardianRow?: boolean } = {}): Tables {
  return {
    cards: [
      { id: 'card-1', player_id: 'player-1', order_id: 'order-1' },
      // a replacement card (migration 0075) has no order_id
      { id: 'card-1b', player_id: 'player-1', order_id: null },
      ...(opts.extraChild ? [{ id: 'card-2', player_id: 'player-2', order_id: 'order-1' }] : []),
    ],
    orders: [{ id: 'order-1', authority_status: status }],
    guardians: opts.guardianRow ? [{ player_id: 'player-1', profile_id: 'someone' }] : [],
    builder_guardian_approval_requests:
      opts.approvedEmail === null
        ? []
        : [
            { order_id: 'order-1', status: 'revoked', guardian_email: 'typo@example.test' },
            { order_id: 'order-1', status: status === 'guardian_approved' ? 'approved' : status === 'guardian_declined' ? 'declined' : 'pending', guardian_email: opts.approvedEmail ?? 'guardian@example.test' },
          ],
  };
}

describe('isGiftAuthorityStatus', () => {
  it('covers exactly the three non-guardian statuses', () => {
    expect(['guardian_approval_pending', 'guardian_approved', 'guardian_declined'].every(isGiftAuthorityStatus)).toBe(true);
    expect([null, undefined, 'confirmed', 'anything'].some(isGiftAuthorityStatus)).toBe(false);
  });
});

describe('chooseProfileInviteRecipient', () => {
  const base = { purchaser_email: 'buyer@example.test', intended_guardian_email: null };

  it('confirmed and historical (NULL) orders: unchanged — intended guardian, else purchaser', () => {
    expect(chooseProfileInviteRecipient({ ...base, authority_status: 'confirmed' }, null)).toEqual({ ok: true, email: 'buyer@example.test', source: 'purchaser' });
    expect(chooseProfileInviteRecipient({ ...base, authority_status: null, intended_guardian_email: 'p@example.test' }, null)).toEqual({
      ok: true, email: 'p@example.test', source: 'intended_guardian',
    });
  });

  it('guardian_approved: only the approving guardian, normalised', () => {
    expect(chooseProfileInviteRecipient({ ...base, authority_status: 'guardian_approved', intended_guardian_email: 'x@example.test' }, ' G@Example.test ')).toEqual({
      ok: true, email: 'g@example.test', source: 'approved_guardian',
    });
  });

  it('guardian_approved with no approving guardian never falls back to the buyer', () => {
    expect(chooseProfileInviteRecipient({ ...base, authority_status: 'guardian_approved' }, null)).toEqual({ ok: false, reason: 'approved_guardian_missing' });
  });

  it('pending and declined gift orders get no invite at all', () => {
    for (const status of ['guardian_approval_pending', 'guardian_declined']) {
      expect(chooseProfileInviteRecipient({ ...base, authority_status: status }, 'g@example.test')).toEqual({ ok: false, reason: 'guardian_not_approved' });
    }
  });
});

describe('resolveProfileInviteRecipient', () => {
  it('reads the approved request (not a revoked or pending one)', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'));
    const r = await resolveProfileInviteRecipient(client, { id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'buyer@example.test', intended_guardian_email: null });
    expect(r).toEqual({ ok: true, email: 'guardian@example.test', source: 'approved_guardian' });
  });

  it('fails closed when the lookup errors', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'), ['builder_guardian_approval_requests']);
    const r = await resolveProfileInviteRecipient(client, { id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'buyer@example.test', intended_guardian_email: null });
    expect(r).toEqual({ ok: false, reason: 'lookup_failed' });
  });

  it('never queries anything for a non-gift order', async () => {
    const { client } = fakeService({}, ['builder_guardian_approval_requests']);
    const r = await resolveProfileInviteRecipient(client, { id: 'o', authority_status: 'confirmed', purchaser_email: 'buyer@example.test', intended_guardian_email: null });
    expect(r.ok).toBe(true);
  });
});

describe('checkGiftFirstGuardianClaim', () => {
  it('approved gift order: the approving guardian (confirmed email, any case) is allowed', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'allowed' });
  });

  it('approved gift order: the buyer is refused', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'refused' });
  });

  it('refuses the right address when the email is not confirmed', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', { email: 'guardian@example.test', email_confirmed_at: null })).toEqual({ outcome: 'refused' });
  });

  it('pending and declined gift orders refuse everyone, including the named guardian', async () => {
    for (const status of ['guardian_approval_pending', 'guardian_declined']) {
      const { client } = fakeService(giftWorld(status));
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'refused' });
    }
  });

  it('approved but no approved request row: refused', async () => {
    const { client } = fakeService(giftWorld('guardian_approved', { approvedEmail: null }));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'refused' });
  });

  it('confirmed orders are not gift orders: unchanged behaviour for anyone', async () => {
    const { client } = fakeService(giftWorld('confirmed'));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('a roster child with no order is not a gift child', async () => {
    const { client } = fakeService({ cards: [{ id: 'c', player_id: 'player-9', order_id: null }] });
    expect(await checkGiftFirstGuardianClaim(client, 'player-9', buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('multi-child gift orders keep today’s behaviour (open decision, see REPORT.md)', async () => {
    const { client } = fakeService(giftWorld('guardian_approved', { extraChild: true }));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('once the child has a guardian, adding another is the normal invite rules’ job', async () => {
    const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'not_gift' });
  });

  describe('R4: card claim codes stay gift-checked after a guardian links (evenIfGuardianExists)', () => {
    const opts = { evenIfGuardianExists: true };
    it('the buyer is refused even though the child already has a guardian (the card lock may have failed)', async () => {
      const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }));
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', { id: 'buyer-id', ...buyer }, opts)).toEqual({ outcome: 'refused' });
    });
    it('an unrelated adult is refused too', async () => {
      const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }));
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', { id: 'x', email: 'x@example.test', email_confirmed_at: CONFIRMED }, opts)).toEqual({ outcome: 'refused' });
    });
    it('someone who is already one of the child’s guardians passes through unchanged', async () => {
      const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }));
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', { id: 'someone', email: 'second@example.test', email_confirmed_at: CONFIRMED }, opts)).toEqual({ outcome: 'not_gift' });
    });
    it('the approving guardian is still allowed', async () => {
      const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }));
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', { id: 'g-id', ...guardian }, opts)).toEqual({ outcome: 'allowed' });
    });
    it('non-gift and multi-child orders are unchanged', async () => {
      expect(await checkGiftFirstGuardianClaim(fakeService(giftWorld('confirmed', { guardianRow: true })).client, 'player-1', { id: 'b', ...buyer }, opts)).toEqual({ outcome: 'not_gift' });
      expect(await checkGiftFirstGuardianClaim(fakeService(giftWorld('guardian_approved', { guardianRow: true, extraChild: true })).client, 'player-1', { id: 'b', ...buyer }, opts)).toEqual({ outcome: 'not_gift' });
    });
    it('a failed guardians read fails closed', async () => {
      const { client } = fakeService(giftWorld('guardian_approved', { guardianRow: true }), ['guardians']);
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', { id: 'b', ...buyer }, opts)).toEqual({ outcome: 'failed' });
    });
  });

  it('presenting the replacement card still finds the gift order through the child', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'));
    // the check is per child, not per card, so the replacement card's missing order_id changes nothing
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'refused' });
  });

  it('any failed read fails closed', async () => {
    for (const t of ['cards', 'orders', 'guardians', 'builder_guardian_approval_requests']) {
      const { client } = fakeService(giftWorld('guardian_approved'), [t]);
      expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'failed' });
    }
  });
});

describe('an approval given from the buyer’s own address (approved before the guardian-email check existed)', () => {
  const selfApproved = (where: 'purchaser' | 'declaration'): Tables => {
    const t = giftWorld('guardian_approved', { approvedEmail: 'Grandparent@Example.test' });
    if (where === 'purchaser') t.orders = [{ id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'grandparent@example.test' }];
    else { t.orders = [{ id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'other-address@example.test' }]; t.builder_order_authority_declarations = [{ order_id: 'order-1', adult_email: 'GRANDPARENT@example.test' }]; }
    return t;
  };

  it.each([['purchaser'], ['declaration']] as const)('matching the %s email: the profile invite is withheld, never sent to the buyer', async (where) => {
    const { client } = fakeService(selfApproved(where));
    const r = await resolveProfileInviteRecipient(client, { id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'grandparent@example.test', intended_guardian_email: null });
    expect(r).toEqual({ ok: false, reason: 'approved_guardian_missing' });
  });

  it.each([['purchaser'], ['declaration']] as const)('matching the %s email: the buyer cannot become first guardian', async (where) => {
    const { client } = fakeService(selfApproved(where));
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', buyer)).toEqual({ outcome: 'refused' });
  });

  it('a genuine approval from a different address is unaffected', async () => {
    const t = giftWorld('guardian_approved');
    t.orders = [{ id: 'order-1', authority_status: 'guardian_approved', purchaser_email: 'grandparent@example.test' }];
    t.builder_order_authority_declarations = [{ order_id: 'order-1', adult_email: 'grandparent@example.test' }];
    const { client } = fakeService(t);
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'allowed' });
  });

  it('a failed buyer-address read fails closed', async () => {
    const { client } = fakeService(giftWorld('guardian_approved'), ['builder_order_authority_declarations']);
    expect(await checkGiftFirstGuardianClaim(client, 'player-1', guardian)).toEqual({ outcome: 'failed' });
  });
});

describe('retireOtherOrderApprovalInvites', () => {
  it('expires unused order-approval invites not sent to the approving guardian, and nothing else', async () => {
    const tables: Tables = {
      player_invites: [
        { id: 'buyer-invite', order_id: 'order-1', origin: 'order_approval', used_at: null, invited_email: 'grandparent@example.test' },
        { id: 'guardian-invite', order_id: 'order-1', origin: 'order_approval', used_at: null, invited_email: 'Guardian@example.test' },
        { id: 'used', order_id: 'order-1', origin: 'order_approval', used_at: '2026-11-01', invited_email: 'grandparent@example.test' },
        { id: 'other-order', order_id: 'order-2', origin: 'order_approval', used_at: null, invited_email: 'x@example.test' },
        { id: 'second-guardian', order_id: 'order-1', origin: 'second_guardian', used_at: null, invited_email: 'y@example.test' },
      ],
    };
    const { client, updates } = fakeService(tables);
    expect(await retireOtherOrderApprovalInvites(client, 'order-1', 'guardian@example.test')).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].ids).toEqual(['buyer-invite']);
    expect(tables.player_invites.find((r) => r.id === 'guardian-invite')?.expires_at).toBeUndefined();
  });
});

describe('checkGiftOrderInviteRedemption (F-1: an order-bearing invite on a gift order)', () => {
  const withBuyer = (t: Tables) => {
    (t.orders[0] as Row).purchaser_email = buyer.email;
    t.builder_order_authority_declarations = [{ order_id: 'order-1', adult_email: buyer.email }];
    return t;
  };

  it('no order_id: not a gift invite, nothing queried', async () => {
    const { client } = fakeService({}, ['orders', 'cards']);
    expect(await checkGiftOrderInviteRedemption(client, null, buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('the approving guardian is allowed even once the child has a guardian', async () => {
    const { client } = fakeService(withBuyer(giftWorld('guardian_approved', { guardianRow: true })));
    expect(await checkGiftOrderInviteRedemption(client, 'order-1', guardian)).toEqual({ outcome: 'allowed' });
  });

  it('the buyer is refused even once the child has a guardian (where checkGiftFirstGuardianClaim says not_gift)', async () => {
    const tables = withBuyer(giftWorld('guardian_approved', { guardianRow: true }));
    expect(await checkGiftFirstGuardianClaim(fakeService(tables).client, 'player-1', buyer)).toEqual({ outcome: 'not_gift' });
    expect(await checkGiftOrderInviteRedemption(fakeService(tables).client, 'order-1', buyer)).toEqual({ outcome: 'refused' });
  });

  it('any other address, or the right address unconfirmed, is refused', async () => {
    const { client } = fakeService(withBuyer(giftWorld('guardian_approved', { guardianRow: true })));
    expect(await checkGiftOrderInviteRedemption(client, 'order-1', { email: 'someone@example.test', email_confirmed_at: CONFIRMED })).toEqual({ outcome: 'refused' });
    expect(await checkGiftOrderInviteRedemption(client, 'order-1', { email: guardian.email, email_confirmed_at: null })).toEqual({ outcome: 'refused' });
  });

  it('pending and declined orders refuse everyone', async () => {
    for (const status of ['guardian_approval_pending', 'guardian_declined']) {
      const { client } = fakeService(withBuyer(giftWorld(status, { guardianRow: true })));
      expect(await checkGiftOrderInviteRedemption(client, 'order-1', guardian)).toEqual({ outcome: 'refused' });
    }
  });

  it('an approval from the buyer’s own address counts as no approval: refused', async () => {
    const { client } = fakeService(withBuyer(giftWorld('guardian_approved', { guardianRow: true, approvedEmail: buyer.email })));
    expect(await checkGiftOrderInviteRedemption(client, 'order-1', buyer)).toEqual({ outcome: 'refused' });
  });

  it('confirmed and historical (NULL) orders are not gift orders', async () => {
    for (const status of ['confirmed', null]) {
      const tables = giftWorld('confirmed', { guardianRow: true });
      (tables.orders[0] as Row).authority_status = status;
      expect(await checkGiftOrderInviteRedemption(fakeService(tables).client, 'order-1', buyer)).toEqual({ outcome: 'not_gift' });
    }
  });

  it('multi-child gift orders are unchanged (held by staff, A2)', async () => {
    const { client } = fakeService(withBuyer(giftWorld('guardian_approved', { extraChild: true, guardianRow: true })));
    expect(await checkGiftOrderInviteRedemption(client, 'order-1', buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('an unknown order id is not a gift order', async () => {
    const { client } = fakeService(withBuyer(giftWorld('guardian_approved')));
    expect(await checkGiftOrderInviteRedemption(client, 'order-404', buyer)).toEqual({ outcome: 'not_gift' });
  });

  it('every failed read fails closed', async () => {
    for (const t of ['orders', 'cards', 'builder_guardian_approval_requests', 'builder_order_authority_declarations']) {
      const { client } = fakeService(withBuyer(giftWorld('guardian_approved', { guardianRow: true })), [t]);
      expect(await checkGiftOrderInviteRedemption(client, 'order-1', guardian)).toEqual({ outcome: 'failed' });
    }
  });
});

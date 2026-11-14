import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPendingDeletionRequestContact } from './deletion-request-contact';

const client = (result: { data: unknown; error: unknown } | 'throw') =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result === 'throw') throw new Error('network');
            return result;
          },
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

describe('readPendingDeletionRequestContact (0097: the address is read just before a request closes)', () => {
  it('returns the address of a pending request', async () => {
    expect(await readPendingDeletionRequestContact(client({ data: { status: 'pending', requester_email: 'g@example.test' }, error: null }), 'squad_invite_participation_deletion_requests', 'r')).toBe('g@example.test');
  });

  it('returns null for a closed request, no address, a failed read or a thrown error', async () => {
    const t = 'player_deletion_requests' as const;
    expect(await readPendingDeletionRequestContact(client({ data: { status: 'rejected', requester_email: 'g@example.test' }, error: null }), t, 'r')).toBeNull();
    expect(await readPendingDeletionRequestContact(client({ data: { status: 'pending', requester_email: null }, error: null }), t, 'r')).toBeNull();
    expect(await readPendingDeletionRequestContact(client({ data: null, error: { message: 'boom' } }), t, 'r')).toBeNull();
    expect(await readPendingDeletionRequestContact(client('throw'), t, 'r')).toBeNull();
  });
});

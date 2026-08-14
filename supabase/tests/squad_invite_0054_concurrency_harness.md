# Migration 0054 concurrency harness

This is the executable hosted-PostgreSQL test specification for the next separately authorised disposable-branch run. Use two independent `pg` clients with strict TLS and synthetic, namespaced identities only. Run each case in a disposable fixture scope and delete/roll back every fixture. Never target staging or production.

## Identical first-call race

1. Synchronise two clients at a barrier, then call `public.submit_squad_invite_request` concurrently with the same organiser, submission key, fingerprint and payload.
2. Assert one result is `created:true`, the other is `created:false`, and both return the same request ID and public reference.
3. Assert one request, exactly four required revision-one declarations, one disabled outbox event and one submitted audit event exist.

## Conflicting-fingerprint race

1. Synchronise two clients using the same organiser and submission key but different valid fingerprints.
2. Assert exactly one call succeeds with `created:true`; the other fails with `submission key conflict`.
3. Assert the persisted request fingerprint belongs to the winner and that only the winner's four declarations, outbox event and audit event exist.

## Atomic rollback on declaration failure

1. In a transaction, install a transaction-local trigger on `public.squad_invite_request_declarations` that raises a synthetic exception before insert.
2. Call the RPC with a new namespaced submission identity and assert the exception is returned.
3. Remove the trigger by rolling back the transaction, then assert from a clean connection that no request, declaration, outbox or audit row exists for that identity.

Record both clients' SQLSTATE/result JSON, relationship counts and cleanup counts. A run passes only when all three cases pass and the final aggregate counts equal their baseline.

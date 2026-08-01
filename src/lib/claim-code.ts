import { randomBytes } from 'crypto';

// Excludes 0/O, 1/I/L — ambiguity-safe for a human to type back in.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 7;

/** Generates a card claim_token or a player_invites code — same format, different tables. */
export function generateClaimCode(): string {
  const bytes = randomBytes(LENGTH);
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * Generates a players.public_player_id — deliberately not the same shape as
 * generateClaimCode's output: this is never typed by a human, only tapped/
 * linked, and it lives for the player's entire public lifetime rather than
 * a brief claim window, so it needs real entropy (128 bits) rather than a
 * short human-safe alphabet. base64url keeps it URL-safe with no padding.
 */
export function generatePublicPlayerId(): string {
  return randomBytes(16).toString('base64url');
}

export function normalizeClaimCode(input: string): string {
  return input.toUpperCase().trim();
}

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = '23505';

type InsertResult<T> = { data: T | null; error: { code?: string; message: string } | null };

/**
 * Runs `insertOnce` (which should attempt an insert using a freshly generated
 * code) up to `maxAttempts` times, retrying only on a unique-constraint
 * collision on the code column itself. At 7 chars from a 32-symbol alphabet
 * collisions are vanishingly rare, but a serverless insert shouldn't assume
 * zero chance of one. Returns the code that succeeded alongside the result.
 *
 * `generate` defaults to generateClaimCode (both existing call sites — coach
 * add-player, Builder order — are unaffected); public_player_id generation
 * passes generatePublicPlayerId instead, reusing the same retry-on-collision
 * shape rather than duplicating it.
 */
export async function withUniqueCodeRetry<T>(
  insertOnce: (code: string) => PromiseLike<InsertResult<T>>,
  maxAttempts = 3,
  generate: () => string = generateClaimCode
): Promise<InsertResult<T> & { code: string | null }> {
  let lastResult: InsertResult<T> = { data: null, error: { message: 'Could not generate a unique code' } };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generate();
    const result = await insertOnce(code);
    if (!result.error || result.error.code !== UNIQUE_VIOLATION) {
      return { ...result, code: result.error ? null : code };
    }
    lastResult = result;
  }
  return { ...lastResult, code: null };
}

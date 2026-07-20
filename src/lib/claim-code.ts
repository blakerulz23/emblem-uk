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
 */
export async function withUniqueCodeRetry<T>(
  insertOnce: (code: string) => PromiseLike<InsertResult<T>>,
  maxAttempts = 3
): Promise<InsertResult<T> & { code: string | null }> {
  let lastResult: InsertResult<T> = { data: null, error: { message: 'Could not generate a unique code' } };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateClaimCode();
    const result = await insertOnce(code);
    if (!result.error || result.error.code !== UNIQUE_VIOLATION) {
      return { ...result, code: result.error ? null : code };
    }
    lastResult = result;
  }
  return { ...lastResult, code: null };
}

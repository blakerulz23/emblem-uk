import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// The queue shows staff who will receive a gift order's profile invite. It
// must apply the same rule as loadApprovedGuardianEmail: an approval given
// from the buyer's own address (purchaser or declared adult email) does not
// count, so the queue says the invite is withheld instead of naming the buyer.
const source = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');

describe('staff queue: gift order invite recipient display', () => {
  it('reads the buyer declarations and skips an approval from a buyer address', () => {
    expect(source).toContain(".from('builder_order_authority_declarations')");
    expect(source).toMatch(/buyerEmails\.get\(a\.order_id\)\?\.has\(normaliseEmail\(a\.guardian_email\)\)\) continue;/);
    expect(source).toContain('No approving guardian on record — invite withheld');
  });
});

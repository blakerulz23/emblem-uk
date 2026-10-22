import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard: code that has been made to report failures without
 * database text must not slip back into returning or logging it. Covers
 * every module that uses the shared route-failure helpers, plus the files
 * Gates 3.4 and 3.5 redacted. A file in scope must not:
 *   - put an error's message, details or hint into a response body;
 *   - return an error's message from a helper as the user-facing error;
 *   - log an error object, message, details or hint.
 * (Other routes still to be reviewed are deliberately out of scope here.)
 */
const ROOT = process.cwd();
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const usesHelpers = walk(path.join(ROOT, 'src'))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.|test-support/.test(f))
  .filter((f) => readFileSync(f, 'utf8').includes("from '@/lib/route-failure'"))
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
const GATE_3_4 = [
  'src/app/api/os/coach-invites/route.ts',
  'src/lib/create-coach-invite.ts',
  'src/lib/send-coach-invite-email.ts',
  'src/app/api/os/account/delete/route.ts',
  'src/lib/create-guardian-invite.ts',
  'src/lib/send-invite-email.ts',
];
// Gate 3.5: the guardian account-control routes, pinned explicitly.
const GATE_3_5 = [
  'src/app/api/os/cards/[id]/status/route.ts',
  'src/app/api/os/players/[id]/deletion-request/route.ts',
  'src/app/api/os/players/[id]/deletion-request/cancel/route.ts',
];
const inScope = Array.from(new Set([...usesHelpers, ...GATE_3_4, ...GATE_3_5])).sort();

const ERR = String.raw`(?:error|err|e|\w+Error|result\.error)`;
const RESPONSE_WITH_TEXT = new RegExp(String.raw`NextResponse\.json\(\s*\{[^}]*\berror:\s*${ERR}\??\.(?:message|details|hint)\b`);
const RETURNED_TEXT = new RegExp(String.raw`\berror:\s*${ERR}\??\.(?:message|details|hint)\b`);
const LOGGED_TEXT = new RegExp(String.raw`console\.(?:error|warn|log|info)\([^)]*(?:\b${ERR}\??\.(?:message|details|hint)\b|,\s*${ERR}\s*\)|res\.text\(\))`);

describe('route failure redaction guard', () => {
  it('covers the expected files', () => {
    for (const f of ['src/app/api/os/team-invites/redeem/route.ts', 'src/app/api/staff/coach-assignments/end/route.ts', ...GATE_3_4, ...GATE_3_5]) expect(inScope).toContain(f);
  });

  it.each(inScope)('%s returns and logs no database or provider error text', (file) => {
    const code = readFileSync(path.join(ROOT, file), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
    expect(code).not.toMatch(RESPONSE_WITH_TEXT);
    expect(code).not.toMatch(RETURNED_TEXT);
    expect(code).not.toMatch(LOGGED_TEXT);
  });
});

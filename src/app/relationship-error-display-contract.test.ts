import fs from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * The screens behind the team-request, claim, invite and staff
 * relationship routes show only the route's own `error` string (fixed by
 * the route; see the *-route-redaction tests) or their own fallback text.
 * None reads a raw error object's message, details or hint.
 */
const SCREENS = [
  'src/app/os/overlays/TeamRequestOnboarding.tsx',
  'src/app/os/overlays/ActivationGate.tsx',
  'src/app/os/overlays/RecoverByEmail.tsx',
  'src/app/os/screens/Profile.tsx',
  'src/app/os/screens/CoachTeam.tsx',
  'src/app/os/overlays/GuardianInviteSheet.tsx',
  'src/app/staff/team-requests/TeamRequestActions.tsx',
  'src/app/staff/coach-assignments/EndAssignmentButton.tsx',
  'src/app/staff/coach-assignments/RemoveDirectLinkButton.tsx',
];

describe('relationship screens never display raw error text', () => {
  for (const file of SCREENS) {
    it(file, () => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/\b(err|error|e|ex|caught)\??\.(message|details|hint)\b/);
      expect(src).not.toMatch(/String\((err|error|e)\)/);
    });
  }
});

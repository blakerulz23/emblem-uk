import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate 2 card suspension/revocation/replacement (migration 0075) is scoped
 * to cards.access_status, card_access_audit_events, the guardian/staff
 * lifecycle RPCs and routes, and NFC/public-profile resolution — nothing in
 * Gemini, background removal, /api/ai-mockup, cropping, card artwork, PDF/
 * print capture, pricing, Shopify, payments/fulfilment, or Squad Invite.
 * Hashes match the ones already pinned by hotfix-0073-protected-areas.test.ts
 * and dob-removal-protected-areas.test.ts (computed independently here via
 * `sha256sum`, not copied) — any future change on this branch that touches
 * one of these files should fail here and be treated as scope creep.
 */
const PROTECTED_FILES: Record<string, string> = {
  'src/components/builder/emblem/bgRemoval.ts': '3ce8418bb63b8215fde4a9f33dfd84761e477ee19161fbdd349ccf2fc9a23d2a',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  'src/components/builder/emblem/aiMockup.ts': 'f48196a262d75042dba471e60b4ac419c8617c9a3d48940ad9799d7c1dd825e1',
  'src/lib/pdf-generator.ts': '94e796512bd29560755659bc25513820cc142fc8a755f353705539f750f49c26',
  'src/lib/card-definition.tsx': '1c6e548d2dd64f5a4c6dc4a80f3414648119b935d12306786dc7a3e2908b26b5',
  'src/lib/print-capture.ts': '8226f6d51869e8ee98ab68ed4636ef4b248a2b9b546d63dd2413b36bdb83184d',
  // Updated for the Auto-fit Player / zoom-out photo-framing fix — a
  // deliberate, reviewed change to cropping and card-art rendering itself,
  // not scope creep from an unrelated feature (same precedent as the
  // Shopify hash update noted below).
  'src/lib/photo-geometry.ts': 'a1222b902b3d305c5ee4b8f8da34b4c24c715ef9f50147abfd67b1a0e64c5a8e',
  // Updated for the player-position simplification (five customer-facing
  // categories replacing GK/RB/CB/etc on the card) — a deliberate, reviewed
  // change to card-art rendering itself, not scope creep from an unrelated
  // feature (same precedent as the Auto-fit Player hash update).
  'src/components/builder/emblem/CardArt.tsx': '800de28930fa1fc21a2b3df2325a262b4b96243d72f88fde667da0ed5b1ea1c0',
  'src/lib/pricing-quote.ts': 'e1797bcc528074c53f6adb44b017b8e5b9b23a2154957faa999adac38fe815ee',
  'src/lib/pricing-engine.ts': 'e2f40e6defa8b779456ddd4b8ac4fc0578d650b4d96c7102bc05097c1a6ce454',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
};
// src/lib/shopify.ts and src/app/api/webhooks/shopify/orders-paid/route.ts
// were removed from this list for Gate 3 (direct Shopify checkout +
// server-verified payment) — the first legitimate, reviewed work since
// this hash was pinned to intentionally change either file.

describe('protected areas remain byte-identical after card lifecycle controls (migration 0075)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});

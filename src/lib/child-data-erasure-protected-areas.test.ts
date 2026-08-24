import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate 2 child-data erasure (migration 0076) is scoped to deletion of
 * stored source/derived files and DB records — it must never change how
 * Gemini, background removal, /api/ai-mockup, cropping, card artwork,
 * PDF/print capture, pricing, Shopify, or Squad Invite's purchasing
 * behaviour actually work. Hashes match every prior baseline already
 * pinned by hotfix-0073/dob-removal/card-lifecycle-protected-areas.test.ts
 * (computed independently here via sha256sum, not copied) — any future
 * change on this branch that touches one of these files should fail here.
 */
const PROTECTED_FILES: Record<string, string> = {
  'src/components/builder/emblem/bgRemoval.ts': '185afdfc5bc678fa11f648108b1aed5448c9c5e91d69e90018098e2791f63e79',
  'src/app/api/ai-mockup/route.ts': '1796ddc2c19f032c444bc41c464d07ad0173cd0d55894db5c8714d85e11468be',
  'src/components/builder/emblem/aiMockup.ts': 'f48196a262d75042dba471e60b4ac419c8617c9a3d48940ad9799d7c1dd825e1',
  'src/lib/pdf-generator.ts': '94e796512bd29560755659bc25513820cc142fc8a755f353705539f750f49c26',
  'src/lib/card-definition.tsx': '3dbbe7061c2af0492b02443fc0a89a887312e2f16bcb2d05c41da1343c0fd2a0',
  'src/lib/print-capture.ts': '193d00d664d72b992595ed02b0b98dcba1430153822d6cb6a821dc9773e5e303',
  'src/lib/photo-geometry.ts': '978e82969fed90ff88d0129e9aebff8da8fea49fc5ea15a7c403bacfd5c98645',
  'src/components/builder/emblem/CardArt.tsx': '6b1118a58e7efb26da3a595ac80b2c4895af4185af2a04b78833154756e1504c',
  'src/lib/shopify.ts': 'dda2d0ed5975698e4482f013ea6a07e7bc7bb509d3e1d249e5ec9af44385ef75',
  'src/lib/pricing-quote.ts': 'e1797bcc528074c53f6adb44b017b8e5b9b23a2154957faa999adac38fe815ee',
  'src/lib/pricing-engine.ts': 'e2f40e6defa8b779456ddd4b8ac4fc0578d650b4d96c7102bc05097c1a6ce454',
  'src/lib/squad-invite-mvp.ts': 'aaa13d3bd1a05ccbe79c88112beed05ae2b2411f35b353acccfeb4025ce88ab3',
  'src/app/api/webhooks/shopify/orders-paid/route.ts': 'f266d02676a9f4bff9fb8cfe8a51d1c76803fcf76b538a036cb383c6c9e36323',
};

describe('protected areas remain byte-identical after child-data erasure (migration 0076)', () => {
  for (const [relativePath, expectedHash] of Object.entries(PROTECTED_FILES)) {
    it(`${relativePath} is unchanged`, () => {
      const content = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      const actualHash = createHash('sha256').update(content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    });
  }
});

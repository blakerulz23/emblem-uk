// Copies the onnxruntime-web WASM runtime into public/ort/ so the builder's
// on-device background removal loads it from our own origin (no CDN).
// Runs from `predev` / `prebuild`; public/ort/ is gitignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The package's exports hide package.json; resolve the wasm entry and use its folder.
const dist = dirname(require.resolve('onnxruntime-web/wasm'));
const out = join(process.cwd(), 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const f of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log('onnxruntime-web runtime copied to public/ort/');

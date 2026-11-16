// Photo Day's behaviour on the final production database.
//
// supabase/tests/0104_0105_photo_day_pglite_test.mjs proves Photo Day on its
// own minimal stand-ins, which 0097 (correctly) refuses: they lack
// auth.users.created_at and production's default privileges. This suite runs
// that same file, every check unchanged, on the production-matched harness
// instead, with migrations in the final production order:
//   0001-0096, 0101, 0103, 0104, 0105, 0106, 0107, 0097, 0098, 0102.
// Only its database setup (the PGlite creation and the migration loop) is
// replaced; the generated copy goes to the OS temp folder and is deleted.
//
// It then adds one lifecycle for the table both PR #140 and Photo Day write to
// (squad_invite_participation_deletion_requests): a parent's request with a
// contact address and a matched Photo Day photo; 0107's erasure (the photo is
// in the inventory, the address is kept while pending); the storage delete is
// recorded; 0076's finalize completes the request, and 0097's trigger clears
// the address in that same write.
//
// Run: node --no-warnings supabase/tests/authz/photo_day_final_production_order_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(HERE, '../0104_0105_photo_day_pglite_test.mjs'), 'utf8');
const startCreate = src.indexOf('const db = new PGlite(');
const endCreate = src.indexOf('`);', startCreate) + 3;
const startLoop = src.indexOf('const files = fs.readdirSync(MIGRATIONS_DIR)');
const endLoop = src.indexOf('check(`applied ${files.length} migrations');
if ([startCreate, startLoop, endLoop].some((i) => i < 0) || endCreate < 3) {
  console.log('FAIL — the Photo Day suite layout changed; update this adapter');
  process.exit(1);
}
const harness = JSON.stringify(pathToFileURL(path.join(HERE, 'harness.mjs')).href);
const create = `const { createDatabase, listMigrations, MIGRATIONS_DIR: HARNESS_MIGRATIONS } = await import(${harness});
const db = await createDatabase();
`;
const loop = `const ORDER = [...listMigrations().filter((m) => m.version <= '0096'),
  ...['0101', '0103', '0104', '0105', '0106', '0107', '0097', '0098', '0102'].map((v) => listMigrations().find((m) => m.version === v))];
const files = ORDER.map((m) => m.file);
check('migrations applied in the final production order (… 0096, 0101, 0103-0107, 0097, 0098, 0102)',
  files.slice(-10).map((f) => f.slice(0, 4)).join(',') === '0096,0101,0103,0104,0105,0106,0107,0097,0098,0102');
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(HARNESS_MIGRATIONS, f), 'utf8'));
  } catch (e) {
    console.log(\`MIGRATION FAILED: \${f} — \${e.message}\`);
    process.exit(1);
  }
  if (f.startsWith('0088_')) await db.exec(READINESS_SQL);
}
`;
const lifecycle = `
// --- PR #140 + Photo Day: the shared deletion request table ---------------------------------
{
  const c9 = await seedCampaign('active', 21);
  const day9 = (await create(c9, STAFF, isoDate(5))).photoDayId;
  const child9 = await seedOwned(c9);
  await consent(child9, true, 'Ola', 'k', 9);
  await confirm(day9, STAFF, 'Both managers agreed by email');
  const TOKEN_D9 = sha('day9-token');
  await issue(day9, STAFF, TOKEN_D9, 24);
  const key9 = keyFor(day9);
  const p9 = await record(day9, TOKEN_D9, key9);
  await match(p9, child9.id);
  const req9 = await val(\`insert into public.squad_invite_participation_deletion_requests(participation_id, requested_by, requester_email)
    values ($1, $2, 'pd-final-order-parent@example.test') returning id\`, [child9.id, child9.guardian]);
  await db.query(\`select set_config('request.jwt.claim.sub', $1, false)\`, [STAFF]);
  const er = await val(\`select public.confirm_squad_invite_participation_erasure($1, 'Parent asked for deletion')\`, [req9]);
  const inv = er.inventory ?? [];
  check('final order: 0107 erasure puts the matched Photo Day photo in the inventory', inv.some((o) => o.s3Key === key9 && o.kind === 'photo_day_photo'), inv);
  check('final order: the contact address is kept while the request is pending (0097 rule)',
    (await one(\`select status, requester_email from public.squad_invite_participation_deletion_requests where id = $1\`, [req9])).requester_email === 'pd-final-order-parent@example.test');
  for (const o of inv) await db.query(\`select public.record_squad_invite_deletion_storage_attempt($1, true, null)\`, [o.id]);
  const fin = await val(\`select public.finalize_squad_invite_participation_erasure($1)\`, [req9]);
  await db.query(\`select set_config('request.jwt.claim.sub', '', false)\`);
  const after = await one(\`select status, requester_email from public.squad_invite_participation_deletion_requests where id = $1\`, [req9]);
  check('final order: 0076 finalize completes the request and 0097 clears the address in the same write',
    after.status === 'completed' && after.requester_email === null, { fin, after });
  check('final order: no closed participation request anywhere still holds an address',
    Number(await val(\`select count(*) from public.squad_invite_participation_deletion_requests where status <> 'pending' and requester_email is not null\`)) === 0);
}
`;
let adapted = src.slice(0, startCreate) + create + src.slice(endCreate, startLoop) + loop + src.slice(endLoop);
adapted = adapted.replace(/^import \{ PGlite \} from '@electric-sql\/pglite';\r?\n/m, '').replace(/^import \{ pgcrypto \} from '@electric-sql\/pglite\/contrib\/pgcrypto';\r?\n/m, '');
// Insert the lifecycle before the suite's closing summary, or at the end.
const tail = adapted.search(/\n(?:await db\.close\(\)|const failed|console\.log\(`\\n)/);
adapted = tail > 0 ? adapted.slice(0, tail) + lifecycle + adapted.slice(tail) : adapted + lifecycle;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pd-final-order-')), 'suite.mjs');
fs.writeFileSync(tmp, adapted);
try {
  await import(pathToFileURL(tmp).href);
} finally {
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

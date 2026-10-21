// Reads the saved production catalog evidence (P1–P5, P7, P8).
//
// The evidence files are kept outside the repository and are never
// committed. Only their sha256 hashes are pinned here, so a run fails if the
// folder holds anything other than the exact exports that were reviewed.
// Every file is catalog metadata only (no rows from application tables).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const EVIDENCE_DIR_ENV = 'EMBLEM_AUTHZ_EVIDENCE_DIR';

export const EVIDENCE_FILES = {
  P1: { file: 'P1-policies.csv', sha256: 'fbe139120557d4419ca75872d828d53b9f9f5c3f9aaa54fdbbde3847b3945532' },
  P2: { file: 'P2-rls-flags.csv', sha256: '42d23df26129378a1ec0592a3fb47b309c25de0e3dd4ec8668d65f1ddd37ed1c' },
  P3: { file: 'P3-table-grants.csv', sha256: 'e371767fd6c20a57a268764a966097a7cc6d98eea301657ecef8498f2a16c447' },
  P4: { file: 'P4-column-privileges.csv', sha256: 'f0a9038371225e102d0f9303fafc77d5919ecc9fbbaee55690845bc56c9a460d' },
  P5: { file: 'P5-functions.csv', sha256: '3907d50373ee3ec6b097981befd65625a96720801618ca29b1e4d8be37fcf292' },
  P7: { file: 'P7-default-privileges.csv', sha256: 'fdab8bf8a2a1b4ac45adb65f1353549df9e0b4301d7b9d3005f3a4f4f1c03356' },
  P8: { file: 'P8-migration-ledger.csv', sha256: '5b6ea59516a17a747d63ebd1bfb615ea334295547f50b0430dbeb8d747298a31' },
};

// RFC 4180 CSV: quoted fields may contain commas, doubled quotes and newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => {
    if (r.length !== header.length) throw new Error(`CSV row has ${r.length} fields, header has ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}

export function evidenceDir() {
  const dir = process.env[EVIDENCE_DIR_ENV];
  if (!dir) throw new Error(`${EVIDENCE_DIR_ENV} is not set. Point it at the private production-evidence folder (see README.md).`);
  return dir;
}

// Returns the parsed rows, after checking the file's hash and that every row
// was captured under the read-only guard.
export function loadEvidence(key) {
  const { file, sha256 } = EVIDENCE_FILES[key];
  const full = path.join(evidenceDir(), file);
  if (!fs.existsSync(full)) throw new Error(`Evidence file missing: ${full}`);
  const bytes = fs.readFileSync(full);
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) throw new Error(`Evidence ${file} hash mismatch: expected ${sha256}, got ${actual}`);
  const rows = parseCsv(bytes.toString('utf8'));
  const unguarded = rows.filter((r) => r.read_only_guard !== 'on');
  if (unguarded.length) throw new Error(`Evidence ${file} has ${unguarded.length} row(s) without read_only_guard = on`);
  return rows.map(({ read_only_guard, ...rest }) => rest);
}

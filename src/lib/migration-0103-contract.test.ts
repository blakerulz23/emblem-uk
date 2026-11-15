import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

const DIR = 'supabase/migrations';
const read = (prefix: string) => {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`missing migration ${prefix}`);
  return readFileSync(`${DIR}/${file}`, 'utf8');
};

// The last `add constraint squad_invite_audit_events_event_type_check` list in a file.
function auditEventList(sql: string): string[] {
  const idx = sql.lastIndexOf('add constraint squad_invite_audit_events_event_type_check');
  if (idx < 0) return [];
  // Lists end with `]))` (array form) or `))` (`in (...)` form): stop at the first.
  const body = sql.slice(idx, sql.indexOf('))', idx));
  return Array.from(body.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
}

const sql0103 = read('0103_');
const restored = auditEventList(sql0103);

describe('migration 0103 — restore Squad Invite audit event types', () => {
  it('allows every audit event type any earlier migration allowed (union of 0052–0081)', () => {
    const everAllowed = new Set<string>();
    for (const prefix of ['0052_', '0057_', '0059_', '0063_', '0066_', '0081_']) {
      for (const e of auditEventList(read(prefix))) everAllowed.add(e);
    }
    expect(everAllowed.size).toBeGreaterThan(20);
    for (const e of Array.from(everAllowed)) expect(restored).toContain(e);
  });

  it('restores the five values 0081 dropped and that functions still write', () => {
    for (const e of ['coach_card_submitted', 'coach_card_locked', 'coach_card_changes_requested', 'photo_rejected', 'campaign_reopened']) {
      expect(auditEventList(read('0081_'))).not.toContain(e);
      expect(restored).toContain(e);
    }
  });

  it('every event type written by a migration function is allowed', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f < '0103');
    const written = new Set<string>();
    for (const f of files) {
      const sql = readFileSync(`${DIR}/${f}`, 'utf8');
      for (const m of Array.from(sql.matchAll(/insert into public\.squad_invite_audit_events[^;]*?values\s*\(([^;]*?)\);/g))) {
        for (const v of Array.from(m[1].matchAll(/'([a-z]+_[a-z_]+)'/g))) {
          if (!['public', 'parent', 'organiser', 'staff', 'system'].includes(v[1])) written.add(v[1]);
        }
      }
    }
    for (const e of Array.from(written)) {
      if (/^(campaign|builder|commitment|pricing|payment|coach|fulfilment|organiser|support|staff|delivery|approval|notification|photo|invitation)_/.test(e)) {
        expect(restored, `event ${e}`).toContain(e);
      }
    }
  });

  it('is widening only: touches no other table, function or row', () => {
    expect(sql0103).not.toMatch(/create (or replace )?function/i);
    expect(sql0103).not.toMatch(/\b(update|delete from|insert into|drop table|truncate)\b/i);
    expect(sql0103.match(/alter table/gi)?.length).toBe(1);
  });

  it('does not edit any earlier migration file', () => {
    for (const f of readdirSync(DIR).filter((x) => x < '0103')) {
      expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('0103_restore');
    }
  });
});

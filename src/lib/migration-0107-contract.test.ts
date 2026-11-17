import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * migration 0107 (Photo Day retention and erasure), CI-enforced shape.
 * Behaviour is proven against real Postgres in
 * supabase/tests/0104_0105_photo_day_pglite_test.mjs.
 */
const DIR = 'supabase/migrations';
const read = (prefix: string) => {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`missing migration ${prefix}`);
  return readFileSync(`${DIR}/${file}`, 'utf8');
};
const sql = read('0107_');
const fnBody = (source: string, header: string) => {
  const start = source.indexOf(header);
  expect(start, header).toBeGreaterThan(-1);
  const bodyStart = source.indexOf('as $$', start);
  return source.slice(bodyStart, source.indexOf('$$;', bodyStart));
};
const RETENTION = [
  'photo_day_effective_delete_after(uuid)',
  'list_photo_days_due_for_deletion(integer)',
  'mark_photo_day_photo_storage_deleted(uuid)',
  'close_photo_day_after_deletion(uuid)',
];

describe('migration 0107 — Photo Day retention and erasure', () => {
  it('retention functions are security definer, empty search_path, owned by postgres, service_role only', () => {
    for (const sig of RETENTION) {
      const name = sig.split('(')[0];
      const start = sql.indexOf(`create or replace function public.${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      expect(sql.slice(start, sql.indexOf('as $$', start))).toMatch(/security definer\s+set search_path = ''/);
      expect(sql).toContain(`alter function public.${sig} owner to postgres;`);
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
  });

  it('the delete-by date is the earlier of the 60-day ceiling and campaign close + 30 days', () => {
    const body = fnBody(sql, 'create or replace function public.photo_day_effective_delete_after(');
    expect(body).toContain('d.photos_delete_after');
    expect(body).toContain("least(c.closed_at, c.cancelled_at, c.deadline_at) + interval '30 days'");
  });

  it('a photo can only be marked deleted, and a day only closed, once due', () => {
    expect(fnBody(sql, 'create or replace function public.mark_photo_day_photo_storage_deleted(')).toContain('public.photo_day_effective_delete_after(v_photo.photo_day_id) > now()');
    const close = fnBody(sql, 'create or replace function public.close_photo_day_after_deletion(');
    expect(close).toContain("'not_due'");
    expect(close).toContain("'photos_remaining'");
    expect(close).toContain("'photo_day_photos_deleted'");
  });

  it('the erasure function is 0076’s body unchanged apart from the marked Photo Day block', () => {
    const original = fnBody(read('0076_'), 'create function public.confirm_squad_invite_participation_erasure(');
    const replaced = fnBody(sql, 'create or replace function public.confirm_squad_invite_participation_erasure(');
    const blockStart = replaced.indexOf('  -- Photo Day (0107):');
    const blockEnd = replaced.indexOf('  end loop;\n', blockStart) + '  end loop;\n\n'.length;
    expect(blockStart).toBeGreaterThan(-1);
    const withoutBlock = (replaced.slice(0, blockStart) + replaced.slice(blockEnd)).replace('  v_photo record;\n', '');
    expect(withoutBlock).toBe(original);
  });

  it('the Photo Day block inventories matched photos and marks them deleted in the same transaction', () => {
    const replaced = fnBody(sql, 'create or replace function public.confirm_squad_invite_participation_erasure(');
    const block = replaced.slice(replaced.indexOf('-- Photo Day (0107):'));
    expect(block).toContain('where participation_id = v_participation_id and deleted_at is null');
    expect(block).toContain("values (p_request_id, v_photo.storage_key, 'photo_day_photo')");
    expect(block).toContain('deleted_at = now()');
    expect(sql).toContain("'other', 'photo_day_photo'");
  });

  it('keeps the erasure function callable only by signed-in users, with the staff check inside', () => {
    expect(sql).toContain('grant execute on function public.confirm_squad_invite_participation_erasure(uuid, text) to authenticated;');
    expect(fnBody(sql, 'create or replace function public.confirm_squad_invite_participation_erasure(')).toContain("raise exception 'Staff access required'");
  });
});

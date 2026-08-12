import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/0048_authoritative_order_persistence.sql'), 'utf8');

describe('migration 0048 authoritative asset contract', () => {
  it('requires a one-to-one print-file/player mapping in the RPC', () => {
    expect(sql).toContain("raise exception 'a print file is required for every approved player'");
    expect(sql).toContain("raise exception 'duplicate print file for the same player'");
    expect(sql).toContain("raise exception 'a print file references a player outside this submission'");
    expect(sql).toContain("raise exception 'missing print file for a submitted player'");
    expect(sql).toContain("v_print_file_prefix := 'print-files/' || p_submission_key::text || '/'");
  });

  it('persists uploaded badges only as structured durable keys', () => {
    expect(sql).toContain("jsonb_build_object('storageKey', v_player->>'badgeStorageKey', 'source', 'upload')::text");
    expect(sql).toContain("raise exception 'uploaded badge for player % contains a non-authoritative URL'");
    expect(sql).not.toContain("coalesce(nullif(v_player->>'badgeSnapshotUrl', ''), nullif(v_player->>'badgeUrl', ''))");
  });

  it('rejects arbitrary official-looking static paths at the RPC boundary', () => {
    expect(sql).toContain("raise exception 'badge reference for player % is not a recognised static asset'");
    expect(sql).toContain("'/templates/emjfl/clubs/afc-oldham.png'");
  });
});

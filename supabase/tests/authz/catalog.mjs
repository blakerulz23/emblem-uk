// Whole-schema catalog snapshot of `public`, for before/after comparisons.
//
// Each entry is "kind:identity" -> a string of everything that defines it,
// including its ACL, so a revoked or narrowed grant shows up as a change.

const QUERIES = {
  relation: `
    select c.relname as id,
           concat_ws(' | ', c.relkind, c.relrowsecurity, c.relforcerowsecurity, coalesce(c.relacl::text, 'default-acl')) as def
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')`,
  column: `
    select c.relname || '.' || a.attname as id,
           concat_ws(' | ', format_type(a.atttypid, a.atttypmod), a.attnotnull,
                     coalesce(pg_get_expr(d.adbin, d.adrelid), 'no-default'), a.attidentity,
                     coalesce(a.attacl::text, 'no-column-acl')) as def
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and a.attnum > 0 and not a.attisdropped`,
  constraint: `
    select c.conrelid::regclass::text || '.' || c.conname as id, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'`,
  index: `
    select indexname as id, indexdef as def from pg_indexes where schemaname = 'public'`,
  policy: `
    select tablename || '.' || policyname as id,
           concat_ws(' | ', permissive, roles::text, cmd, coalesce(qual, 'null'), coalesce(with_check, 'null')) as def
    from pg_policies where schemaname = 'public'`,
  function: `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as id,
           concat_ws(' | ', p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner),
                     coalesce(array_to_string(p.proconfig, ','), 'no-config'),
                     coalesce(p.proacl::text, 'default-acl'), p.prosrc) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'`,
  trigger: `
    select c.relname || '.' || t.tgname as id, pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal`,
  publication: `
    select pubname || '.' || tablename as id, 'published' as def
    from pg_publication_tables where schemaname = 'public'`,
};

export async function snapshotCatalog(db) {
  const snap = new Map();
  for (const [kind, sql] of Object.entries(QUERIES)) {
    const { rows } = await db.query(sql);
    for (const r of rows) snap.set(`${kind}:${r.id}`, r.def);
  }
  return snap;
}

export function diffCatalog(before, after) {
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const added = [...after.keys()].filter((k) => !before.has(k));
  const changed = [...before.keys()].filter((k) => after.has(k) && after.get(k) !== before.get(k));
  return { removed, added, changed };
}

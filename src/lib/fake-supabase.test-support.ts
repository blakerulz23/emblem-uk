/**
 * A minimal chainable stand-in for a Supabase client, for route tests that
 * need to see exactly which tables and functions a route touches, and with
 * which client (session or service role). Every query and rpc is recorded;
 * `respond`/`rpc` decide the result. Not a database: authorization itself
 * is proven against real PostgreSQL in supabase/tests/authz.
 */
export type FakeResult = { data?: unknown; error?: { code?: string; message: string } | null; count?: number | null };

export type FakeCall = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  columns?: string;
  options?: unknown;
  filters: Array<[string, string, unknown]>;
};

export function createFakeSupabase(opts: {
  user?: { id: string; email?: string | null } | null;
  respond?: (call: FakeCall) => FakeResult | undefined;
  rpc?: (fn: string, args: Record<string, unknown>) => FakeResult | undefined;
  /** auth.admin.getUserById: the user record for an id, or an error. */
  adminUser?: (id: string) => { user?: { id: string; email?: string | null; email_confirmed_at?: string | null } | null; error?: { code?: string; message: string } | null } | undefined;
}) {
  const calls: FakeCall[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const adminCalls: string[] = [];

  const client = {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
      admin: {
        getUserById: async (id: string) => {
          adminCalls.push(id);
          const r = opts.adminUser?.(id) ?? {};
          return { data: { user: r.user ?? null }, error: r.error ?? null };
        },
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const r = opts.rpc?.(fn, args) ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from(table: string) {
      const call: FakeCall = { table, op: 'select', filters: [] };
      const finish = () => {
        calls.push(call);
        const r = opts.respond?.(call) ?? {};
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
      };
      const filter = (kind: string) => (column: string, value?: unknown) => {
        call.filters.push([kind, column, value]);
        return builder;
      };
      const builder = {
        select(columns?: string, options?: unknown) {
          if (call.op === 'select') {
            call.columns = columns;
            call.options = options;
          }
          return builder;
        },
        insert(payload: unknown) {
          call.op = 'insert';
          call.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          call.op = 'update';
          call.payload = payload;
          return builder;
        },
        upsert(payload: unknown, options?: unknown) {
          call.op = 'upsert';
          call.payload = payload;
          call.options = options;
          return builder;
        },
        delete() {
          call.op = 'delete';
          return builder;
        },
        eq: filter('eq'),
        neq: filter('neq'),
        is: filter('is'),
        in: filter('in'),
        not: filter('not'),
        gt: filter('gt'),
        gte: filter('gte'),
        lt: filter('lt'),
        lte: filter('lte'),
        order: () => builder,
        limit: () => builder,
        maybeSingle: finish,
        single: finish,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => finish().then(resolve, reject),
      };
      return builder;
    },
  };

  return { client, calls, rpcCalls, adminCalls };
}

/** True when any recorded call writes the given table. */
export function wroteTable(calls: FakeCall[], table: string) {
  return calls.some((c) => c.table === table && c.op !== 'select');
}

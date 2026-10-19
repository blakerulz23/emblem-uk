/**
 * Save and resume for the card builder — adapted from Emblem Canada's
 * builder-draft-persistence.ts for the UK's guardian-led model.
 *
 * What is kept, and where (this device only — nothing here is ever sent to
 * a server, and no order, player or Squad Invite record is created by
 * saving or restoring):
 *   - The draft (card details, current step, contact form) goes to
 *     localStorage under a key scoped to one journey: the direct builder,
 *     or one specific Squad Invite participation. Two journeys never
 *     restore into each other.
 *   - Photos and badges live as blob: URLs, which die with the page. Their
 *     bytes are kept in IndexedDB, keyed by scope + URL, and swapped for
 *     fresh blob: URLs on restore. They never leave the device.
 *   - A draft older than DRAFT_TTL_MS is ignored and deleted, together with
 *     its photos, and purgeExpiredBuilderDrafts() sweeps every scope so an
 *     abandoned journey does not linger on a shared family device.
 *   - clearBuilderDraft(scope) wipes a scope once its order is submitted or
 *     committed, or when the parent chooses "Discard" / "Start again".
 *
 * What is never kept: guardian verification, adult-permission results,
 * Squad Invite declarations and anything that proves consent. Those are
 * always confirmed again in the live session (the builder decides which
 * step a restored draft may land on).
 *
 * Every storage call is wrapped: private windows, blocked storage or a full
 * quota simply mean no restore, never a broken builder.
 */

export const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;
const KEY_PREFIX = 'emblem.uk.builder.draft.v1:';
const DB_NAME = 'emblem-uk-builder-draft';
const STORE = 'blobs';

export type DraftScope = 'direct' | `squad-invite:${string}`;

export function draftScopeFor(squadInviteParticipationId?: string | null): DraftScope {
  return squadInviteParticipationId ? `squad-invite:${squadInviteParticipationId}` : 'direct';
}

export type BuilderDraftSnapshot<TData> = { savedAt: number; data: TData };

/** Minimal key–value store (localStorage in the browser, a Map in tests). */
export type DraftKeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
};

/** Minimal blob store (IndexedDB in the browser, a Map in tests). */
export type DraftBlobStore = {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

export type DraftEnvironment = {
  kv: DraftKeyValueStore | null;
  blobs: DraftBlobStore | null;
  now: () => number;
  /** blob: URL -> Blob (fetch in the browser). Returns null when the URL is dead. */
  readBlobUrl: (url: string) => Promise<Blob | null>;
  /** Blob -> fresh blob: URL (URL.createObjectURL in the browser). */
  createBlobUrl: (blob: Blob) => string;
};

/** Pure: every blob: URL string anywhere inside a JSON-able value. */
export function collectBlobUrls(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith('blob:')) out.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectBlobUrls(item, out));
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectBlobUrls(item, out));
  }
  return out;
}

/**
 * Pure: `value` with each blob: URL swapped through `map`. A blob: URL with
 * no replacement (its bytes were lost) becomes '' — callers treat that as
 * "no photo", so the card simply asks for one again.
 */
export function replaceBlobUrls<T>(value: T, map: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') {
    if (!value.startsWith('blob:')) return value;
    return (map.get(value) ?? '') as unknown as T;
  }
  if (Array.isArray(value)) return value.map((item) => replaceBlobUrls(item, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = replaceBlobUrls(item, map);
    return out as T;
  }
  return value;
}

const kvKey = (scope: DraftScope) => `${KEY_PREFIX}${scope}`;
const blobKey = (scope: DraftScope, url: string) => `${scope}|${url}`;
const scopeOfBlobKey = (key: string) => key.slice(0, key.indexOf('|'));

function readSnapshot<TData>(env: DraftEnvironment, scope: DraftScope): BuilderDraftSnapshot<TData> | null {
  try {
    const raw = env.kv?.getItem(kvKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuilderDraftSnapshot<TData>;
    return parsed && typeof parsed.savedAt === 'number' && parsed.data !== undefined ? parsed : null;
  } catch {
    return null;
  }
}

async function dropBlobs(env: DraftEnvironment, scope: DraftScope, keep: ReadonlySet<string> = new Set()): Promise<void> {
  if (!env.blobs) return;
  const keys = await env.blobs.keys().catch(() => [] as string[]);
  for (const key of keys) {
    if (scopeOfBlobKey(key) === scope && !keep.has(key)) await env.blobs.delete(key).catch(() => undefined);
  }
}

export async function saveDraftWith<TData>(env: DraftEnvironment, scope: DraftScope, data: TData): Promise<void> {
  if (!env.kv) return;
  const urls = collectBlobUrls(data);
  const keep = new Set<string>();
  // Photo bytes go in BEFORE the snapshot that points at them, so a refresh
  // mid-save never restores a draft that promises a photo it cannot find.
  if (env.blobs) {
    const existing = new Set(await env.blobs.keys().catch(() => [] as string[]));
    for (const url of Array.from(urls)) {
      const key = blobKey(scope, url);
      keep.add(key);
      if (existing.has(key)) continue;
      const blob = await env.readBlobUrl(url).catch(() => null);
      if (blob) await env.blobs.put(key, blob).catch(() => undefined);
    }
  }
  try {
    env.kv.setItem(kvKey(scope), JSON.stringify({ savedAt: env.now(), data }));
  } catch {
    /* full quota or blocked storage: no draft, never a broken builder */
  }
  // Photos no longer in the draft (replaced or removed) are deleted on every save.
  await dropBlobs(env, scope, keep);
}

export async function loadDraftWith<TData>(env: DraftEnvironment, scope: DraftScope): Promise<BuilderDraftSnapshot<TData> | null> {
  const snapshot = readSnapshot<TData>(env, scope);
  if (!snapshot) return null;
  if (env.now() - snapshot.savedAt > DRAFT_TTL_MS) {
    await clearDraftWith(env, scope);
    return null;
  }
  const map = new Map<string, string>();
  if (env.blobs) {
    for (const url of Array.from(collectBlobUrls(snapshot.data))) {
      const blob = await env.blobs.get(blobKey(scope, url)).catch(() => undefined);
      if (!blob) continue;
      const fresh = env.createBlobUrl(blob);
      map.set(url, fresh);
      // Store under the fresh URL too, so the next save finds it already kept.
      // The old key is pruned by that save, never here: deleting it first
      // would lose the photo on a quick second refresh.
      await env.blobs.put(blobKey(scope, fresh), blob).catch(() => undefined);
    }
  }
  return { savedAt: snapshot.savedAt, data: replaceBlobUrls(snapshot.data, map) };
}

export async function clearDraftWith(env: DraftEnvironment, scope: DraftScope): Promise<void> {
  try {
    env.kv?.removeItem(kvKey(scope));
  } catch {
    /* ignore */
  }
  await dropBlobs(env, scope);
}

/** Deletes every expired draft (any scope) and any photo bytes with no draft left. */
export async function purgeExpiredDraftsWith(env: DraftEnvironment): Promise<void> {
  const live = new Set<string>();
  for (const key of env.kv?.keys() ?? []) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const scope = key.slice(KEY_PREFIX.length) as DraftScope;
    const snapshot = readSnapshot(env, scope);
    if (!snapshot || env.now() - snapshot.savedAt > DRAFT_TTL_MS) {
      await clearDraftWith(env, scope);
    } else {
      live.add(scope);
    }
  }
  if (!env.blobs) return;
  for (const key of await env.blobs.keys().catch(() => [] as string[])) {
    if (!live.has(scopeOfBlobKey(key))) await env.blobs.delete(key).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Browser environment
// ---------------------------------------------------------------------------

function browserKv(): DraftKeyValueStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const ls = window.localStorage;
    return {
      getItem: (key) => ls.getItem(key),
      setItem: (key, value) => ls.setItem(key, value),
      removeItem: (key) => ls.removeItem(key),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => Boolean(k)),
    };
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onerror = () => { db.close(); resolve(undefined); };
      transaction.onabort = () => { db.close(); resolve(undefined); };
    } catch {
      db.close();
      resolve(undefined);
    }
  }));
}

const browserBlobs: DraftBlobStore = {
  get: async (key) => {
    const value = await idbRequest<unknown>('readonly', (store) => store.get(key));
    return value instanceof Blob ? value : undefined;
  },
  put: async (key, blob) => { await idbRequest('readwrite', (store) => store.put(blob, key)); },
  delete: async (key) => { await idbRequest('readwrite', (store) => store.delete(key)); },
  keys: async () => ((await idbRequest<IDBValidKey[]>('readonly', (store) => store.getAllKeys())) ?? []).filter((k): k is string => typeof k === 'string'),
};

function browserEnv(): DraftEnvironment {
  return {
    kv: browserKv(),
    blobs: typeof indexedDB === 'undefined' ? null : browserBlobs,
    now: () => Date.now(),
    readBlobUrl: async (url) => {
      try {
        const response = await fetch(url);
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    },
    createBlobUrl: (blob) => URL.createObjectURL(blob),
  };
}

/** Collapses React StrictMode's double mount: two concurrent restores of one
 *  scope would re-key the same photos under each other. Released as soon as
 *  the restore settles, so a later client-side return reads the fresh draft. */
const restoring = new Map<DraftScope, Promise<unknown>>();

export function loadBuilderDraft<TData>(scope: DraftScope): Promise<BuilderDraftSnapshot<TData> | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  let run = restoring.get(scope) as Promise<BuilderDraftSnapshot<TData> | null> | undefined;
  if (!run) {
    run = loadDraftWith<TData>(browserEnv(), scope);
    restoring.set(scope, run);
    const release = () => { if (restoring.get(scope) === run) restoring.delete(scope); };
    run.then(release, release);
  }
  return run;
}

export function saveBuilderDraft<TData>(scope: DraftScope, data: TData): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return saveDraftWith(browserEnv(), scope, data);
}

export function clearBuilderDraft(scope: DraftScope): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return clearDraftWith(browserEnv(), scope);
}

export function purgeExpiredBuilderDrafts(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return purgeExpiredDraftsWith(browserEnv());
}

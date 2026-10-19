import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  clearDraftWith,
  collectBlobUrls,
  DRAFT_TTL_MS,
  draftScopeFor,
  loadDraftWith,
  purgeExpiredDraftsWith,
  replaceBlobUrls,
  saveDraftWith,
  type DraftEnvironment,
} from './builder-draft-persistence';

/** An in-memory device: localStorage + IndexedDB + blob: URLs. */
function fakeDevice(start = 1_000_000) {
  const kvMap = new Map<string, string>();
  const blobMap = new Map<string, Blob>();
  const liveUrls = new Map<string, Blob>();
  let clock = start;
  let urlCounter = 0;
  const env: DraftEnvironment = {
    kv: {
      getItem: (k) => kvMap.get(k) ?? null,
      setItem: (k, v) => { kvMap.set(k, v); },
      removeItem: (k) => { kvMap.delete(k); },
      keys: () => Array.from(kvMap.keys()),
    },
    blobs: {
      get: async (k) => blobMap.get(k),
      put: async (k, b) => { blobMap.set(k, b); },
      delete: async (k) => { blobMap.delete(k); },
      keys: async () => Array.from(blobMap.keys()),
    },
    now: () => clock,
    readBlobUrl: async (url) => liveUrls.get(url) ?? null,
    createBlobUrl: (blob) => {
      urlCounter += 1;
      const url = `blob:https://emblem.cards/restored-${urlCounter}`;
      liveUrls.set(url, blob);
      return url;
    },
  };
  const photo = (name: string) => {
    const url = `blob:https://emblem.cards/${name}`;
    liveUrls.set(url, new Blob([name], { type: 'image/jpeg' }));
    return url;
  };
  /** Simulates closing the tab: every blob: URL dies, storage survives. */
  const closeTab = () => liveUrls.clear();
  return { env, kvMap, blobMap, photo, closeTab, advance: (ms: number) => { clock += ms; } };
}

const order = (photoUrl: string, extra: Record<string, unknown> = {}) => ({
  type: 'single',
  players: [{ id: 'p1', firstName: 'Riley', photo: { srcUrl: photoUrl, hiResUrl: photoUrl, crop: { x: 0, y: 0, scale: 1 }, bgRemoved: false } }],
  ...extra,
});

describe('pure helpers', () => {
  it('finds every blob: URL and swaps them, blanking any whose bytes were lost', () => {
    const value = { a: 'blob:x/1', b: ['https://cdn/p.png', { c: 'blob:x/2' }] };
    expect(Array.from(collectBlobUrls(value)).sort()).toEqual(['blob:x/1', 'blob:x/2']);
    expect(replaceBlobUrls(value, new Map([['blob:x/1', 'blob:x/9']]))).toEqual({ a: 'blob:x/9', b: ['https://cdn/p.png', { c: '' }] });
  });

  it('scopes the direct builder and each Squad Invite participation separately', () => {
    expect(draftScopeFor(undefined)).toBe('direct');
    expect(draftScopeFor('abc')).toBe('squad-invite:abc');
  });
});

describe('save and resume', () => {
  it('restores card details, step and photo after the tab is closed and reopened', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('riley')), activeStepId: 'personalise' });
    d.closeTab();
    const restored = await loadDraftWith<{ order: ReturnType<typeof order>; activeStepId: string }>(d.env, 'direct');
    expect(restored?.data.activeStepId).toBe('personalise');
    const src = restored!.data.order.players[0].photo.srcUrl;
    expect(src).toMatch(/^blob:https:\/\/emblem\.cards\/restored-/);
    expect(src).toBe(restored!.data.order.players[0].photo.hiResUrl);
    expect(await (await d.env.readBlobUrl(src))!.text()).toBe('riley');
  });

  it('a photo whose bytes are gone comes back blank (the card asks for a photo again), never broken', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('riley')) });
    d.blobMap.clear();
    const restored = await loadDraftWith<{ order: ReturnType<typeof order> }>(d.env, 'direct');
    expect(restored?.data.order.players[0].photo.srcUrl).toBe('');
  });

  it('a replaced photo’s old bytes are deleted on the next save', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('first')) });
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('second')) });
    const stored = await Promise.all(Array.from(d.blobMap.values()).map((b) => b.text()));
    expect(stored).toEqual(['second']);
  });

  it('a second quick refresh still finds the photo (old key kept until the next save)', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('riley')) });
    d.closeTab();
    await loadDraftWith(d.env, 'direct');
    d.closeTab();
    const again = await loadDraftWith<{ order: ReturnType<typeof order> }>(d.env, 'direct');
    expect(again?.data.order.players[0].photo.srcUrl).not.toBe('');
  });

  it('drafts expire after DRAFT_TTL_MS and are deleted with their photos', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('riley')) });
    d.advance(DRAFT_TTL_MS + 1);
    expect(await loadDraftWith(d.env, 'direct')).toBeNull();
    expect(d.kvMap.size).toBe(0);
    expect(d.blobMap.size).toBe(0);
  });

  it('clearing a draft deletes the details and the photo bytes for that journey only', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('direct')) });
    await saveDraftWith(d.env, 'squad-invite:p-1', { order: order(d.photo('si')) });
    await clearDraftWith(d.env, 'direct');
    expect(await loadDraftWith(d.env, 'direct')).toBeNull();
    const si = await loadDraftWith<{ order: ReturnType<typeof order> }>(d.env, 'squad-invite:p-1');
    expect(si?.data.order.players[0].photo.srcUrl).not.toBe('');
  });

  it('a Squad Invite draft never restores into the direct builder or another participation', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'squad-invite:p-1', { order: order(d.photo('si')) });
    expect(await loadDraftWith(d.env, 'direct')).toBeNull();
    expect(await loadDraftWith(d.env, 'squad-invite:p-2')).toBeNull();
  });

  it('purge removes expired drafts in every scope and orphaned photo bytes', async () => {
    const d = fakeDevice();
    await saveDraftWith(d.env, 'squad-invite:old', { order: order(d.photo('old')) });
    d.advance(DRAFT_TTL_MS + 1);
    await saveDraftWith(d.env, 'direct', { order: order(d.photo('fresh')) });
    await d.env.blobs!.put('squad-invite:ghost|blob:x/ghost', new Blob(['ghost']));
    await purgeExpiredDraftsWith(d.env);
    expect(Array.from(d.kvMap.keys())).toEqual(['emblem.uk.builder.draft.v1:direct']);
    const remaining = await Promise.all(Array.from(d.blobMap.values()).map((b) => b.text()));
    expect(remaining).toEqual(['fresh']);
  });

  it('blocked storage means no draft, never an error', async () => {
    const env: DraftEnvironment = {
      kv: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined, keys: () => [] },
      blobs: null,
      now: () => 0,
      readBlobUrl: async () => null,
      createBlobUrl: () => '',
    };
    await expect(saveDraftWith(env, 'direct', { a: 1 })).resolves.toBeUndefined();
    await expect(loadDraftWith(env, 'direct')).resolves.toBeNull();
  });
});

describe('the builder keeps guardian controls and creates no records when saving or restoring', () => {
  const lib = readFileSync('src/lib/builder-draft-persistence.ts', 'utf8');
  const builder = readFileSync('src/components/emblem-uk/ProductionBuilder.tsx', 'utf8');

  it('draft storage never talks to a server', () => {
    // Only blob: URLs are read (to copy photo bytes into IndexedDB).
    expect(lib).not.toMatch(/fetch\(['"`]\/api/);
    expect(lib).not.toMatch(/method:\s*['"]POST/);
  });

  it('never stores adult permission, guardian verification or Squad Invite declarations', () => {
    const type = builder.slice(builder.indexOf('type BuilderDraftData'), builder.indexOf('};', builder.indexOf('type BuilderDraftData')));
    expect(type).toMatch(/order: OrderDraft/);
    expect(type).not.toMatch(/adultPermission|squadInviteAccepted|submittedOrderId|enquiryStatus|checkout/i);
  });

  it('never resumes on the permission step, and keeps Squad Invite cards locked to their campaign', () => {
    expect(builder).toMatch(/restored\.activeStepId === 'adult-permission' \? 'review'/);
    expect(builder).toMatch(/type: 'single', collectionType: 'custom', collectionName: 'Custom Collection', club: squadInviteContext\.campaignClubName/);
    expect(builder).toMatch(/const draftScope = draftScopeFor\(squadInviteContext\?\.participationId\)/);
  });

  it('a failed or interrupted submit never costs the parent their work: the draft is kept until the server confirms', () => {
    const submit = builder.slice(builder.indexOf('const submitEnquiry = async'), builder.indexOf('const startNewOrder'));
    expect(submit).not.toMatch(/submittingRef\.current = true;\s*[\s\S]{0,120}clearBuilderDraft/);
    // Cleared only after a confirmed success response.
    expect(submit).toMatch(/setEnquiryStatus\('sent'\);\s*\/\/ Submitted: nothing left to resume on this device\.\s*clearBuilderDraft\(draftScope\)/);
    const commit = builder.slice(builder.indexOf('const submitSquadInviteCommitment = async'));
    expect(commit.slice(0, commit.indexOf("setSquadInvitePhase('success')"))).not.toContain('clearBuilderDraft');
  });

  it('save-and-resume cannot place an order twice: the submission id is stored before anything is sent, and a restored draft is checked before sending is allowed', () => {
    const submit = builder.slice(builder.indexOf('const submitEnquiry = async'), builder.indexOf('const startNewOrder'));
    const keyAt = submit.indexOf('const submissionKey = await ensureSubmissionKey();');
    const savedAt = submit.indexOf('pendingSubmission: pending');
    const firstUpload = submit.indexOf('orderWithUploadedAssets(');
    expect(keyAt).toBeGreaterThan(-1);
    expect(savedAt).toBeGreaterThan(keyAt);
    expect(savedAt).toBeLessThan(firstUpload);
    expect(submit).toContain('if (!recoveryAllowsSend) return;');
    expect(builder).toMatch(/const recoveryAllowsSend = submitRecovery === 'none' \|\| submitRecovery === 'not_placed';/);
    expect(builder).toMatch(/const canSendEnquiry =\s*recoveryAllowsSend &&/);
    expect(builder).toMatch(/if \(!squadInviteContext && restored\.pendingSubmission\?\.key\) \{\s*setPendingSubmission\(restored\.pendingSubmission\);\s*checkPendingSubmission\(restored\.pendingSubmission\.key\);/);
    expect(builder).toContain("fetch('/api/builder-submissions/status'");
  });

  it('recovery outcomes: placed clears the draft; not_placed continues with work intact; unknown or in-progress keeps sending paused', () => {
    const check = builder.slice(builder.indexOf('const checkPendingSubmission = async'), builder.indexOf('const checkPendingSubmission = async') + 1600);
    expect(check).toMatch(/body\.status === 'placed'\) \{[\s\S]*?clearBuilderDraft\(draftScope\)[\s\S]*?setSubmitRecovery\('placed'\)/);
    expect(check).toMatch(/body\.status === 'not_placed'\) \{[\s\S]*?setPendingSubmission\(null\);[\s\S]*?setSubmitRecovery\('not_placed'\)/);
    expect(check).toMatch(/catch \{[\s\S]*?setSubmitRecovery\('unknown'\)/);
    expect(builder).toMatch(/const draftDone = enquiryStatus === 'sent' \|\| squadInvitePhase === 'success' \|\| submitRecovery === 'placed';/);
    expect(builder).toMatch(/if \(!draftRestored \|\| draftDone\) return;/);
  });

  it('tells parents, on the photo step, that unfinished details and photos stay on this device for up to 3 days', () => {
    expect(builder).toContain('className="uk-draft-notice"');
    expect(builder).toMatch(/saved on this device only, for up to 3 days/);
  });

  it('clears the draft when an order is submitted or a Squad Invite card is committed', () => {
    expect(builder).toMatch(/setEnquiryStatus\('sent'\);\s*\/\/ Submitted: nothing left to resume on this device\.\s*clearBuilderDraft\(draftScope\)/);
    expect(builder).toMatch(/setSquadInvitePhase\('success'\);\s*clearBuilderDraft\(draftScope\)/);
  });
});

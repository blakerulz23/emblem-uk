'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Status = { teamName: string; venueLabel: string; scheduledFor: string; uploaded: number; maxPhotos: number; expiresAt: string };
type Item = { id: number; file: File; state: 'queued' | 'preparing' | 'uploading' | 'done' | 'failed'; error?: string };

// Must stay in step with src/lib/photo-day.ts (server limits). Kept as
// literals here so this client bundle never imports the server module.
const MAX_BYTES = 4 * 1024 * 1024;
const EDGES = [3200, 2400, 1800];
const CONCURRENCY = 2;

/**
 * Resizes in the browser so each request stays under Vercel's ~4.5 MB body
 * limit. Re-drawing on a canvas also drops the camera's EXIF/GPS data
 * before anything leaves the device; the server re-encodes again anyway.
 */
async function prepare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    for (const edge of EDGES) {
      for (const quality of [0.9, 0.8]) {
        const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= MAX_BYTES) return blob;
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error('too large');
}

export default function PhotographerUpload({ photoDayId }: { photoDayId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [linkError, setLinkError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const nextId = useRef(1);

  const loadStatus = useCallback(async (t: string) => {
    try {
      const response = await fetch(`/api/photo-day/${photoDayId}/upload`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok) { setLinkError(json?.error ?? 'This upload link is not valid.'); setStatus(null); return; }
      setStatus(json as Status);
      setLinkError('');
    } catch {
      setLinkError('Could not reach Emblem. Check your connection and reload.');
    }
  }, [photoDayId]);

  useEffect(() => {
    const t = window.location.hash.slice(1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(t)) { setLinkError('This upload link is incomplete. Open the full link Emblem sent you.'); return; }
    setToken(t);
    void loadStatus(t);
  }, [loadStatus]);

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function uploadOne(item: Item, t: string): Promise<'ok' | 'failed' | 'stop'> {
    update(item.id, { state: 'preparing', error: undefined });
    let blob: Blob;
    try { blob = await prepare(item.file); } catch {
      update(item.id, { state: 'failed', error: 'Could not read this file. Export it as JPEG and try again.' });
      return 'failed';
    }
    update(item.id, { state: 'uploading' });
    const body = new FormData();
    body.append('file', blob, 'photo.jpg');
    try {
      const response = await fetch(`/api/photo-day/${photoDayId}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body });
      if (response.ok) { update(item.id, { state: 'done' }); return 'ok'; }
      const json = await response.json().catch(() => null);
      update(item.id, { state: 'failed', error: json?.error ?? 'Upload failed.' });
      // Link revoked/expired/closed, day full, or rate-limited: stop sending more.
      return [404, 409, 410, 429].includes(response.status) ? 'stop' : 'failed';
    } catch {
      update(item.id, { state: 'failed', error: 'Network error.' });
      return 'failed';
    }
  }

  async function run(queue: Item[]) {
    if (!token || running || queue.length === 0) return;
    setRunning(true);
    let stopped = false;
    let index = 0;
    const worker = async () => {
      while (!stopped && index < queue.length) {
        const item = queue[index++];
        if ((await uploadOne(item, token)) === 'stop') stopped = true;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    await loadStatus(token);
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added = Array.from(files).map((file) => ({ id: nextId.current++, file, state: 'queued' as const }));
    setItems((list) => [...list, ...added]);
    void run(added);
  }

  const done = items.filter((i) => i.state === 'done').length;
  const failed = items.filter((i) => i.state === 'failed');

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm font-bold uppercase tracking-widest text-orange-600">Emblem Photo Day</p>
      <h1 className="mt-1 text-3xl font-bold">{status ? status.teamName : 'Photo upload'}</h1>

      {linkError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 font-semibold text-red-800">{linkError}</p>}

      {status && (
        <>
          <p className="mt-2 text-neutral-700">
            {status.venueLabel} · {new Date(`${status.scheduledFor}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} ·
            link works until {new Date(status.expiresAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1 font-semibold">{status.uploaded} of {status.maxPhotos} photos uploaded</p>

          <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-labelledby="before-upload">
            <h2 id="before-upload" className="font-bold">Before you upload</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Delete every frame that shows a child who is not on your permission list. Don&apos;t upload them.</li>
              <li>Upload team and individual photos only. Nothing from changing rooms or toilets.</li>
              <li>After uploading, delete the photos from your camera, cards and computer. Keep no copies.</li>
            </ul>
          </section>

          <label className="mt-6 block">
            <span className="sr-only">Choose photos</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple disabled={running}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              className="block w-full rounded-xl border-2 border-dashed border-neutral-300 p-6 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-orange-600 file:px-4 file:py-2 file:font-bold file:text-white" />
          </label>
          <p className="mt-2 text-xs text-neutral-600">Photos are resized on this device before upload. You can only add photos here: you can&apos;t view or delete them afterwards.</p>
        </>
      )}

      {items.length > 0 && (
        <section className="mt-6" aria-live="polite">
          <p className="font-semibold">{done} of {items.length} sent{running ? '…' : ''}{failed.length ? ` · ${failed.length} failed` : ''}</p>
          {failed.length > 0 && !running && (
            <button type="button" onClick={() => void run(failed)} className="mt-2 min-h-[44px] rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700">Retry failed photos</button>
          )}
          <ul className="mt-3 max-h-80 overflow-y-auto rounded-xl border text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                <span className="truncate">{it.file.name}</span>
                <span className={it.state === 'failed' ? 'font-semibold text-red-700' : it.state === 'done' ? 'text-emerald-700' : 'text-neutral-500'}>
                  {it.state === 'failed' ? it.error : it.state === 'done' ? 'Sent' : it.state === 'queued' ? 'Waiting' : it.state === 'preparing' ? 'Resizing' : 'Sending'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

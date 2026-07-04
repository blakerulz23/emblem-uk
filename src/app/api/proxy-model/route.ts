// src/app/api/proxy-model/route.ts
// Streams a Meshy-hosted GLB through our domain to dodge CORS issues
// in the in-browser three.js loader. ?url=<encoded-glb-url>

import { NextResponse } from 'next/server';

export const maxDuration = 60;

const ALLOWED_HOSTS = new Set([
  'assets.meshy.ai',
  'cdn.meshy.ai',
  'storage.googleapis.com',
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');
  if (!target) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let host = '';
  try {
    host = new URL(target).host;
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  const upstream = await fetch(target);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'model/gltf-binary',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

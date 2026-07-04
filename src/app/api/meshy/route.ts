// src/app/api/meshy/route.ts
// POST: kick off a new Meshy image-to-3d job.
// Body: { imageDataUrl } — typically the Gemini-stylized bobblehead image.
// Returns: { jobId }

import { NextRequest, NextResponse } from 'next/server';
import { createImageTo3dJob } from '@/lib/meshy';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.MESHY_API_KEY) {
    return NextResponse.json(
      { error: 'MESHY_API_KEY not configured. The 3D model will be generated when you order.' },
      { status: 503 },
    );
  }

  let body: { imageDataUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { imageDataUrl } = body;
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Invalid imageDataUrl' }, { status: 400 });
  }

  try {
    const jobId = await createImageTo3dJob(imageDataUrl);
    return NextResponse.json({ jobId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create Meshy job';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// src/app/api/meshy/[jobId]/route.ts
// GET: poll the status of a Meshy job.

import { NextResponse } from 'next/server';
import { getImageTo3dJob } from '@/lib/meshy';

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params;
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const job = await getImageTo3dJob(jobId);
    return NextResponse.json({
      status: job.status,
      progress: job.progress ?? 0,
      modelUrls: job.model_urls || null,
      thumbnailUrl: job.thumbnail_url || null,
      error: job.error || null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to poll Meshy job';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

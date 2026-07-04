// src/lib/meshy.ts
// Server-side wrapper around the Meshy.ai image-to-3D API.
// Ported from boppleheads.

const MESHY_BASE = 'https://api.meshy.ai/openapi/v1';

export type MeshyJobStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface MeshyJob {
  id: string;
  status: MeshyJobStatus;
  progress?: number;
  model_urls?: {
    glb?: string;
    obj?: string;
    fbx?: string;
    usdz?: string;
  };
  thumbnail_url?: string;
  video_url?: string;
  error?: { name: string; message: string; details?: string };
}

export async function createImageTo3dJob(imageUrl: string): Promise<string> {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) throw new Error('MESHY_API_KEY not configured');

  const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      ai_model: 'meshy-5',
      topology: 'triangle',
      target_polycount: 30000,
      should_texture: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meshy API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { result: string };
  return data.result;
}

export async function getImageTo3dJob(jobId: string): Promise<MeshyJob> {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) throw new Error('MESHY_API_KEY not configured');

  const res = await fetch(`${MESHY_BASE}/image-to-3d/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meshy API error ${res.status}: ${err}`);
  }

  return (await res.json()) as MeshyJob;
}

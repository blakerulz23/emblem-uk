import { merchantFeedXml } from '@/lib/marketing/merchant-feed';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET() {
  return new Response(merchantFeedXml(), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

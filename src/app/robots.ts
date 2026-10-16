import type { MetadataRoute } from 'next';
import { absoluteUrl, DISALLOWED_PREFIXES } from '@/lib/marketing/site';

/**
 * Only production emblem.cards is indexable. Previews and *.vercel.app
 * deployments disallow everything so a review build can never compete with
 * (or leak ahead of) the live site in search results.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/feeds/'],
        disallow: [...DISALLOWED_PREFIXES],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}

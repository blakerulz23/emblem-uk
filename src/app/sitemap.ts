import type { MetadataRoute } from 'next';
import { absoluteUrl, PUBLIC_PAGES } from '@/lib/marketing/site';

/** Public marketing pages only — never builder sessions, profiles, cards or staff tools. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

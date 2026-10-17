import type { MetadataRoute } from 'next';
import { absoluteUrl, PUBLIC_PAGES } from '@/lib/marketing/site';

/**
 * Public marketing pages only — never builder sessions, profiles, cards or
 * staff tools. lastModified is each page's real content date, not the build
 * time, so it only moves when the page actually changes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: page.contentUpdated,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

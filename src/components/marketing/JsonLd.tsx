import { serializeJsonLd } from '@/lib/marketing/structured-data';

/** Server-rendered JSON-LD block. Pass one schema object or an array of them. */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

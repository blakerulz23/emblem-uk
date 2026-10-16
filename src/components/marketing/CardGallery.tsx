import Link from 'next/link';

/**
 * Lightweight card gallery (idea from the Canadian homepage, rebuilt for
 * performance). Canada renders real cards from full print templates in the
 * browser (~3 MB per design); here each design is a pre-rendered 400px WebP
 * (27–54 KB), lazy-loaded, in a native horizontal scroll strip.
 *
 * Designs are shown with placeholder details ("Your Name") and no player
 * photo, rendered once from the UK CardFace renderer — no child's image.
 */
const DESIGNS = [
  { id: 'custom-solar', name: 'Solar' },
  { id: 'custom-royal', name: 'Royal Edition' },
  { id: 'custom-emerald', name: 'Emerald Edition' },
  { id: 'custom-galaxy', name: 'Galaxy' },
  { id: 'custom-glacier', name: 'Glacier Edition' },
  { id: 'custom-crimson', name: 'Crimson' },
] as const;

export default function CardGallery({ heading = 'Pick their design.', eyebrow = 'The cards', ctaHref = '/builder?mode=single', trackPrefix = 'gallery' }: { heading?: string; eyebrow?: string; ctaHref?: string; trackPrefix?: string }) {
  return (
    <section id="cards" className="emh-gallery" aria-labelledby="emh-gallery-heading">
      <div className="emh-gallery-head">
        <p className="emh-eyebrow">{eyebrow}</p>
        <h2 id="emh-gallery-heading">{heading}</h2>
        <p>Every design is printed on premium 400gsm stock with their photo, name, number and club. Swipe to see more.</p>
      </div>
      <ul className="emh-gallery-strip">
        {DESIGNS.map((d) => (
          <li key={d.id}>
            <Link href={ctaHref} className="emh-gallery-card" data-track={`${trackPrefix}_${d.id}`}>
              <img
                src={`/assets/home/gallery/${d.id}.webp`}
                width={400}
                height={560}
                loading="lazy"
                decoding="async"
                alt={`${d.name} personalised football card design with space for their photo, name and number`}
              />
              <span>{d.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="emh-gallery-note">Your card shows their own photo, name, number and club.</p>
    </section>
  );
}

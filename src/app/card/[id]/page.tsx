import { notFound } from 'next/navigation';
import { SAMPLE_CARDS, type ProfileBlock } from './sample-data';

function Block({ block }: { block: ProfileBlock }) {
  if (block.type === 'stats') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.items.length}, 1fr)`, gap: 10 }}>
        {block.items.map((s) => (
          <div
            key={s.label}
            style={{
              textAlign: 'center', padding: '14px 6px', borderRadius: 14,
              background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 22, color: '#fff' }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, letterSpacing: '0.06em', color: 'var(--accent)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === 'text') {
    return (
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', textAlign: 'center', margin: 0 }}>
        {block.body}
      </p>
    );
  }
  if (block.type === 'link') {
    const primary = block.style !== 'secondary';
    return (
      <a
        href={block.url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block', textAlign: 'center', padding: '14px 16px', borderRadius: 12,
          background: primary ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
          color: '#fff', textDecoration: 'none',
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14,
          boxShadow: primary ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        }}
      >
        {block.label}
      </a>
    );
  }
  // links_row
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {block.items.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '10px 18px', borderRadius: 999, background: 'rgba(255,255,255,0.06)',
            color: '#fff', textDecoration: 'none', fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 600, fontSize: 13, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        >
          {s.label}
        </a>
      ))}
    </div>
  );
}

export default function CardProfilePage({ params }: { params: { id: string } }) {
  const card = SAMPLE_CARDS[params.id];
  if (!card) notFound();

  if (card.status === 'pending_staff_review') {
    return (
      <div style={{ background: 'var(--ink)', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            Emblem · Player Profile
          </div>
          <h1 style={{ marginTop: 16, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 24, color: '#fff' }}>
            {card.name}&rsquo;s profile is being set up
          </h1>
          <p style={{ marginTop: 10, fontFamily: 'var(--font-manrope), system-ui', fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)' }}>
            You chose to have the Emblem team build this profile for you. It&rsquo;ll be live here within 1 business day &mdash; check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh' }}>
      <div className="mx-auto max-w-md px-5 py-10">
        <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', textAlign: 'center' }}>
          Emblem · Profile
        </div>

        <div
          style={{
            marginTop: 20, borderRadius: 24, overflow: 'hidden', aspectRatio: '4 / 5',
            background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.photo} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>

        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>
            {card.name}
          </h1>
          <div style={{ marginTop: 6, fontFamily: 'var(--font-jbmono), monospace', fontSize: 13, letterSpacing: '0.06em', color: 'var(--accent)', textTransform: 'uppercase' }}>
            {card.subtitle}
          </div>
        </div>

        <div style={{ marginTop: 26, display: 'grid', gap: 18 }}>
          {card.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>

        <div style={{ marginTop: 36, textAlign: 'center', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)' }}>
          MAKE YOUR OWN AT EMBLEM.CARDS
        </div>
      </div>
    </div>
  );
}

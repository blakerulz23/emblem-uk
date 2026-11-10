import Link from 'next/link';
import Icon from '@/components/builder/emblem/Icon';
import { TapVideo } from '@/app/HomeEffects';

/**
 * "Every player deserves their moment." Dark rounded panel with an orange
 * glow, copy and a "Make yours" CTA into the card builder, beside the tap
 * video. Used on the homepage, above pricing.
 */
export default function PlayerMomentSection({ ctaTrack }: { ctaTrack?: string }) {
  return (
    <section id="tap" style={{ maxWidth: 'none', padding: 0 }}>
      <div style={{ maxWidth: 1140, margin: 'clamp(20px, 4vw, 40px) auto', padding: 'clamp(40px, 6vw, 72px) clamp(28px, 5vw, 72px)', background: 'var(--ink)', borderRadius: 'clamp(24px, 4vw, 40px)', display: 'grid', gridTemplateColumns: '1.1fr 1fr', alignItems: 'center', gap: 48, position: 'relative', overflow: 'hidden' }} className="tap-grid">
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, var(--accent), transparent 45%)', opacity: 0.35, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--accent)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)' }} />
            SPORT AT EVERY LEVEL
          </span>
          <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.025em', margin: 0, color: '#fff', textWrap: 'balance' as const }}>
            Every player deserves their moment.
          </h2>
          <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 'clamp(16px, 1.5vw, 18.5px)', lineHeight: 1.5, color: 'rgba(255,255,255,.72)', margin: 0, maxWidth: '46ch', textWrap: 'pretty' as const }}>
            The moments that matter aren&rsquo;t reserved for packed stadiums. Emblem turns personal milestones, proud achievements and unforgettable performances into collectibles that celebrate how far they&rsquo;ve come.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/builder?mode=single" data-track={ctaTrack} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, borderRadius: 14, height: 52, padding: '0 22px', fontSize: 16, background: 'var(--accent)', color: '#fff', boxShadow: '0 8px 24px var(--accent-glow)' }}>
              MAKE YOURS <Icon name="chevR" size={18} />
            </Link>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 300 }}>
          <TapVideo poster="/videos/emblem-tap-poster.jpg" />
        </div>
      </div>
    </section>
  );
}

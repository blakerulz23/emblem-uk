import FrostChromeHockeyCard from '@/components/emblem-uk/hockey/FrostChromeHockeyCard';
import { HOCKEY_FROST_CHROME_PACK } from '@/lib/hockey-frost-chrome-pack';

export const metadata = {
  title: 'Frost Chrome Hockey Preview',
};

const samples = [
  {
    name: 'Avery Stone',
    number: '27',
    team: 'North Ice',
    position: 'C' as const,
    stats: { gp: '32', g: '14', a: '18', pts: '32' },
  },
  {
    name: 'Maximilian Van Riemsdyk',
    number: '91',
    team: 'Whiteout Academy',
    position: 'LW' as const,
    stats: { gp: '28', g: '21', a: '12', pts: '33' },
  },
  {
    name: 'Noah Chen',
    number: '1',
    team: 'Metro Blades',
    position: 'G' as const,
    stats: { gp: '25', g: '0', a: '3', pts: '3' },
  },
];

export default function HockeyFrostChromePreviewPage() {
  return (
    <main style={{
      minHeight: '100vh',
      padding: '42px 20px 64px',
      color: '#f8fbff',
      background: 'radial-gradient(circle at 18% 8%, rgba(116,220,255,.22), transparent 30rem), radial-gradient(circle at 88% 10%, rgba(255,106,31,.13), transparent 24rem), linear-gradient(140deg,#02040a,#06111e 48%,#02060b)',
      fontFamily: 'var(--font-manrope), system-ui, sans-serif',
    }}>
      <section style={{ width: 'min(1180px, 100%)', margin: '0 auto' }}>
        <p style={{ margin: '0 0 12px', color: '#74dcff', fontSize: 12, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' }}>
          Emblem Hockey / Hidden Dev Preview
        </p>
        <h1 style={{ margin: '0 0 12px', fontFamily: 'var(--font-sora), system-ui, sans-serif', fontSize: 'clamp(44px, 7vw, 86px)', lineHeight: .9, letterSpacing: 0, textTransform: 'uppercase' }}>
          {HOCKEY_FROST_CHROME_PACK.collection}
        </h1>
        <p style={{ maxWidth: 720, margin: '0 0 34px', color: '#9fb3c8', lineHeight: 1.65 }}>
          First incubator pass for a hockey-native card language: rink glass, cold chrome foil,
          skate-cut motion, sweater-number hierarchy, and hockey stats. This route is intentionally
          under /dev and is not connected to the public football buyer flow.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <FrostChromeHockeyCard {...samples[0]} size={330} />
          <FrostChromeHockeyCard {...samples[0]} side="back" size={330} />
        </div>

        <h2 style={{ margin: '44px 0 18px', fontSize: 24 }}>Stress Samples</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {samples.map((sample) => (
            <FrostChromeHockeyCard key={sample.name} {...sample} size={260} />
          ))}
        </div>
      </section>
    </main>
  );
}


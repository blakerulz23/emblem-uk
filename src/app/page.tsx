import Link from 'next/link';

const points = [
  'Premium printed cards',
  'Interactive digital profile',
  'Single players to full squads',
];

const steps = [
  ['01', 'Upload photos', 'Start with one child, siblings, friends, or a full squad in one session.'],
  ['02', 'Choose a card design', 'Use the official EMJFL-style template or keep building new football and rugby looks.'],
  ['03', 'Add the details', 'Name, club, age group, position, shirt number, stats, photos, highlights, and memories.'],
  ['04', 'Approve and print', 'Review every card, approve the order, then create a keepsake that keeps growing.'],
];

const audiences = [
  ['Parents', 'Preserve the goals, muddy boots, awards nights, and small moments that should not disappear.'],
  ['Clubs', 'Create a consistent keepsake for a team, age group, tournament, or end-of-season presentation.'],
  ['Leagues', 'Build a collectible player journey that can return every season.'],
];

export default function Home() {
  return (
    <div style={{ overflowX: 'clip' }}>
      <section style={{ background: '#130d09', color: '#fff' }}>
        <div
          style={{
            maxWidth: 1160,
            margin: '0 auto',
            padding: 'clamp(54px, 8vw, 104px) 24px clamp(42px, 7vw, 84px)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.02fr) minmax(320px, .98fr)',
            gap: 42,
            alignItems: 'center',
          }}
          className="emblem-home-hero"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <span style={{ color: '#ff6a2a', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Play. Remember. Belong.
            </span>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-sora), system-ui', fontSize: 'clamp(38px, 6vw, 72px)', lineHeight: 0.98, letterSpacing: 0, maxWidth: 760 }}>
              Turn your child&apos;s football photo into an official player card.
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.78)', fontSize: 'clamp(17px, 2vw, 21px)', lineHeight: 1.48, maxWidth: 660 }}>
              Premium printed cards with an interactive digital profile featuring season stats, photos, highlights and memories, all in one keepsake.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/builder?mode=single" style={{ height: 54, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: '0 22px', background: '#ff5a1f', color: '#fff', fontWeight: 800, boxShadow: '0 14px 34px rgba(255,90,31,.32)' }}>
                Create a card
              </Link>
              <Link href="/builder?mode=squad" style={{ height: 54, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: '0 22px', background: 'rgba(255,255,255,.08)', color: '#fff', fontWeight: 800, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)' }}>
                Build a team pack
              </Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: 'rgba(255,255,255,.72)', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12 }}>
              {points.map((point) => <span key={point}>{point}</span>)}
            </div>
          </div>

          <div style={{ position: 'relative', minHeight: 520, display: 'grid', placeItems: 'center' }}>
            <img src="/templates/emjfl/background.png" alt="" style={{ position: 'absolute', width: '76%', maxWidth: 360, transform: 'rotate(-6deg) translate(-38px, 20px)', borderRadius: 18, boxShadow: '0 34px 70px rgba(0,0,0,.5)' }} />
            <img src="/templates/emjfl/back-background.png" alt="" style={{ position: 'absolute', width: '76%', maxWidth: 360, transform: 'rotate(7deg) translate(38px, -6px)', borderRadius: 18, boxShadow: '0 34px 70px rgba(0,0,0,.42)' }} />
            <img src="/templates/emjfl/background.png" alt="Official EMJFL-style player card template" style={{ position: 'relative', zIndex: 2, width: '80%', maxWidth: 385, borderRadius: 18, boxShadow: '0 38px 90px rgba(0,0,0,.58)' }} />
          </div>
        </div>
      </section>

      <section id="sports" style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) 24px' }}>
        <div style={{ maxWidth: 720, marginBottom: 28 }}>
          <p style={{ margin: '0 0 10px', color: '#ff5a1f', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Grassroots sport</p>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-sora), system-ui', fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: 1.06 }}>Football first. Rugby next.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }} className="emblem-home-two">
          <article style={{ borderRadius: 8, background: '#fff', padding: 28, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 26 }}>Football</h3>
            <p style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.55 }}>Shirt number, position, club and age group on the card. Apps, goals, assists, clean sheets, Player of the Match and season memories on the profile.</p>
          </article>
          <article style={{ borderRadius: 8, background: '#111', color: '#fff', padding: 28 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 26 }}>Rugby</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', lineHeight: 1.55 }}>Junior rugby templates can follow the same flow for tries, tackles, awards, team photos and season highlights.</p>
          </article>
        </div>
      </section>

      <section id="how" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: 760, marginBottom: 30 }}>
            <p style={{ margin: '0 0 10px', color: '#ff5a1f', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>How it works</p>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-sora), system-ui', fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: 1.06 }}>One builder for one player or the whole squad.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }} className="emblem-home-steps">
            {steps.map(([num, title, copy]) => (
              <article key={num} style={{ borderRadius: 8, padding: 22, background: '#f5f5f7', minHeight: 220 }}>
                <span style={{ color: '#ff5a1f', fontWeight: 900, fontSize: 13 }}>{num}</span>
                <h3 style={{ margin: '18px 0 8px', fontSize: 20 }}>{title}</h3>
                <p style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5, fontSize: 14.5 }}>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="team-orders" style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'center' }} className="emblem-home-two">
          <div>
            <p style={{ margin: '0 0 10px', color: '#ff5a1f', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Team orders</p>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-sora), system-ui', fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: 1.06 }}>Approve multiple cards in the same session.</h2>
            <p style={{ margin: '16px 0 0', color: 'var(--ink-soft)', lineHeight: 1.58, fontSize: 17 }}>The proper builder now comes over from Youthcards, including real templates, card preview, edit screens and the EMJFL club badge flow. Next is shaping the squad-order UI around UK football and rugby clubs.</p>
          </div>
          <div style={{ borderRadius: 8, background: '#14100d', color: '#fff', padding: 24 }}>
            {['Upload a batch of player photos', 'Choose or approve one design across the squad', 'Edit any player card individually', 'Track which cards still need details'].map((item) => (
              <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: '#ff5a1f', flex: '0 0 auto' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ background: '#130d09', color: '#fff' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(56px, 8vw, 96px) 24px' }}>
          <h2 style={{ margin: '0 0 24px', fontFamily: 'var(--font-sora), system-ui', fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: 1.06 }}>Built for parents, clubs and leagues.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }} className="emblem-home-steps">
            {audiences.map(([title, copy]) => (
              <article key={title} style={{ borderRadius: 8, background: 'rgba(255,255,255,.08)', padding: 24, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 22 }}>{title}</h3>
                <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', lineHeight: 1.55 }}>{copy}</p>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/builder?mode=single" style={{ height: 54, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: '0 22px', background: '#ff5a1f', color: '#fff', fontWeight: 800 }}>
              Start the builder
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

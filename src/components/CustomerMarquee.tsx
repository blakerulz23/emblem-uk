'use client';

/**
 * CustomerMarquee — horizontal auto-scrolling marquee of 312×312 customer
 * cards. On hover a card springs toward the viewer (Apple "Designed for
 * Families"-style), an NFC scan beam sweeps the photo, a phone mockup rises
 * from the bottom revealing the athlete's profile, NFC ripple rings pulse,
 * and gold stars settle at the bottom. Pure CSS — no animation libraries.
 *
 * Drop the customer photos in /public/customers/c1.png —¦ c5.png
 * Brand orange: #ff5a1f   Page bg: #f4f4f7
 */

type Stat = [value: string, label: string];

type Player = {
  src: string;
  name: string;
  num: string;
  pos: string;
  stats: [Stat, Stat, Stat];
  screen?: string;
};

const PLAYERS: Player[] = [
  { src: '/customers/c1.png', name: 'Marcus Reed',     num: '#12', pos: 'Guard - Kings Youth',  stats: [['24.6', 'PPG'], ['8.1', 'RPG'], ['5.3', 'APG']], screen: '/screens/s1.png' },
  { src: '/customers/c2.png', name: 'Cameron Cayden',  num: '#54', pos: 'Guard - Kings',         stats: [['19.2', 'PPG'], ['11.4', 'RPG'], ['3.6', 'APG']], screen: '/screens/s2.png' },
  { src: '/customers/c3.png', name: 'Devon Hayes',     num: '#3',  pos: 'Guard - Eastside',      stats: [['27.8', 'PPG'], ['4.2', 'RPG'], ['7.9', 'APG']], screen: '/screens/s3.png' },
  { src: '/customers/c4.png', name: 'Jaylen Carter',   num: '#24', pos: 'Wing - Northgate',      stats: [['22.1', 'PPG'], ['6.7', 'RPG'], ['4.8', 'APG']] },
  { src: '/customers/c5.png', name: 'Theo Maxwell',    num: '#9',  pos: 'Center - Summit',       stats: [['15.5', 'PPG'], ['12.9', 'RPG'], ['2.1', 'APG']], screen: '/screens/s5.png' },
];


function Card({ p }: { p: Player }) {
  return (
    <figure className="cm-card">
      <img className="cm-photo" src={p.src} alt={`${p.name} holding their custom card`} loading="lazy" />
      <div className="cm-dim" />
      <div className="cm-scan" />
      <div className="cm-rings"><i /><i /><i /></div>

      <div className="cm-cap">
        <div className="cm-cap-t">Tap any phone.</div>
        <div className="cm-cap-s">No app. No aim. Just tap.</div>
      </div>

      {p.screen !== undefined && (
        <div className="cm-phone">
          <div className="cm-notch" />
          <div className="cm-screen">
            <img className="cm-scr-img" src={p.screen} alt="" aria-hidden="true" />
          </div>
        </div>
      )}

    </figure>
  );
}

export default function CustomerMarquee() {
  const loop = [...PLAYERS, ...PLAYERS]; // duplicate for a seamless -50% scroll
  return (
    <section className="cm-section">
      <div className="cm-head">
        <h2 className="cm-title">Tap it. See everything.</h2>
        <p className="cm-sub">
          Every piece carries a real NFC chip. Hold any phone over it and their profile loads instantly. No app, no aim, just tap.
        </p>
      </div>

      <div className="cm-mask">
        <div className="cm-track">
          {[0, 1].map((dup) => (
            <div className="cm-group" key={dup}>
              {PLAYERS.map((p, i) => <Card key={`${dup}-${i}`} p={p} />)}
            </div>
          ))}
        </div>
      </div>

      <div className="cm-guide-wrap">
        <button className="cm-guide-btn" type="button">
          Watch a quick guide
          <span className="cm-play">
            <svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      </div>

      <style jsx global>{`
        .cm-section {
          --accent: #ff5a1f;
          --spring: cubic-bezier(.34, 1.4, .64, 1);
          background: #f4f4f7;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          color: #0b0b0f;
          padding-top: 8px;
        }
        .cm-head {
          max-width: 1140px;
          margin: 0 auto;
          padding: clamp(56px, 8vw, 104px) 28px clamp(24px, 4vw, 40px);
          display: flex; flex-direction: column; gap: 14px;
        }
        .cm-head > * { max-width: 640px; }
        .cm-eyebrow {
          display: flex; align-items: center; gap: 11px;
          font-family: 'Space Mono', ui-monospace, monospace;
          font-size: 13px; font-weight: 700; letter-spacing: .22em;
          text-transform: uppercase; color: #6b7075;
        }
        .cm-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px rgba(255,90,31,.16); }
        .cm-title { margin: 0; font-size: clamp(34px, 5vw, 56px); font-weight: 800; letter-spacing: -.02em; line-height: 1.02; }
        .cm-sub { margin: 6px 0 0; font-size: clamp(15px, 1.5vw, 17px); line-height: 1.5; color: #6b7075; max-width: 46ch; }

        /* watch-a-guide pill */
        .cm-guide-wrap { display: flex; justify-content: center; padding: 8px 0 64px; }
        .cm-guide-btn {
          display: inline-flex; align-items: center; gap: 14px; cursor: pointer;
          border: 0; background: #eceef1; color: #0b0b0f;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 17px; font-weight: 700;
          padding: 12px 12px 12px 26px; border-radius: 999px;
          transition: background .25s ease, transform .25s var(--spring);
        }
        .cm-guide-btn:hover { background: #e2e5e9; transform: translateY(-1px); }
        .cm-play { width: 42px; height: 42px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; }
        .cm-play svg { width: 16px; height: 16px; display: block; margin-left: 2px; }

        /* full-bleed marquee */
        .cm-mask {
          width: 100vw; margin-left: calc(50% - 50vw); overflow: hidden;
          padding: 120px 0 130px;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
                  mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
        }
        .cm-track {
          display: flex; width: max-content;
          perspective: 1400px; perspective-origin: 50% 50%;
          animation: cm-scroll 46s linear infinite;
        }
        .cm-track:has(.cm-card:hover) { animation-play-state: paused; }
        @keyframes cm-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .cm-group { display: flex; align-items: center; gap: 26px; padding-left: 26px; transform-style: preserve-3d; }

        /* card */
        .cm-card {
          position: relative; flex: 0 0 auto; margin: 0;
          width: 312px; height: 312px; border-radius: 24px; overflow: hidden;
          background: #d8dbdf; outline: 1px solid rgba(11,11,15,.06);
          box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 22px 44px -18px rgba(11,11,15,.34), 0 6px 14px -8px rgba(11,11,15,.22);
          transition: transform .55s var(--spring), box-shadow .55s var(--spring), opacity .4s ease, filter .4s ease;
          transform-origin: center center; will-change: transform;
        }
        .cm-card:nth-child(odd)  { transform: translateY(-16px) translateZ(0); }
        .cm-card:nth-child(even) { transform: translateY(16px) translateZ(0); }

        .cm-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: center 38%; transition: transform .9s var(--spring); z-index: 1; }
        .cm-dim { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .5s ease;
          background: linear-gradient(180deg, rgba(8,8,12,.05) 0%, rgba(8,8,12,.42) 46%, rgba(8,8,12,.78) 100%); }

        /* NFC scan beam */
        .cm-scan { position: absolute; left: 0; right: 0; top: 0; height: 48%; z-index: 5; pointer-events: none; opacity: 0; transform: translateY(-120%);
          background: linear-gradient(180deg, rgba(255,90,31,0) 0%, rgba(255,90,31,.10) 40%, rgba(255,140,60,.55) 78%, rgba(255,200,150,.95) 100%);
          box-shadow: 0 6px 18px 2px rgba(255,90,31,.55); }
        .cm-scan::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: rgba(255,225,200,.95); box-shadow: 0 0 12px 2px rgba(255,140,60,.9); }

        /* caption above phone */
        .cm-cap { position: absolute; top: 20px; left: 0; right: 0; z-index: 7; text-align: center; padding: 0 16px; pointer-events: none; opacity: 0; transform: translateY(8px); transition: opacity .45s ease, transform .45s var(--spring); }
        .cm-cap-t { color: #fff; font-weight: 800; font-size: 20px; letter-spacing: -.01em; text-shadow: 0 2px 10px rgba(0,0,0,.45); }
        .cm-cap-s { color: rgba(255,255,255,.82); font-size: 12.5px; font-weight: 600; margin-top: 3px; text-shadow: 0 1px 6px rgba(0,0,0,.4); }

        /* NFC ripple rings */
        .cm-rings { position: absolute; left: 50%; bottom: 64px; z-index: 4; transform: translateX(-50%); pointer-events: none; }
        .cm-rings i { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; border: 2px solid rgba(255,90,31,.8); opacity: 0; transform: scale(.3); }

        /* phone mockup */
        .cm-phone { position: absolute; left: 50%; bottom: -34px; z-index: 6; width: 158px; height: 250px;
          transform: translateX(-50%) translateY(115%); transition: transform .7s var(--spring) 1.1s;
          background: #0b0b0f; border-radius: 34px; padding: 7px;
          box-shadow: 0 18px 40px -10px rgba(0,0,0,.55), 0 0 0 1.5px rgba(255,255,255,.06) inset; }
        .cm-notch { position: absolute; top: 13px; left: 50%; transform: translateX(-50%); width: 46px; height: 13px; border-radius: 8px; background: #0b0b0f; z-index: 3; }
        .cm-screen { width: 100%; height: 100%; border-radius: 28px; overflow: hidden; background: #fff; position: relative; }
        .cm-scr-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 28px; background: #fff;
          transform: translateY(14px); opacity: 0; transition: transform .6s var(--spring) 1.45s, opacity .5s ease 1.45s; }
        .cm-scr-inner { position: absolute; inset: 0; padding: 26px 14px 14px; display: flex; flex-direction: column; gap: 11px;
          transform: translateY(14px); opacity: 0; transition: transform .6s var(--spring) 1.45s, opacity .5s ease 1.45s; }

        .cm-ath { display: flex; align-items: center; gap: 9px; }
        .cm-av { width: 34px; height: 34px; border-radius: 50%; flex: 0 0 auto; background: radial-gradient(120% 120% at 30% 25%, #ff7a43, #ff5a1f 70%); box-shadow: 0 4px 10px -3px rgba(255,90,31,.6); }
        .cm-nm { font-weight: 800; font-size: 13.5px; line-height: 1.1; color: #0b0b0f; }
        .cm-num { color: var(--accent); }
        .cm-pos { font-size: 10px; font-weight: 600; color: #9a9ea3; margin-top: 1px; }
        .cm-stats { display: grid; grid-template-columns: repeat(3, 1fr); background: #f4f4f7; border-radius: 12px; padding: 9px 4px; }
        .cm-stats > div { text-align: center; }
        .cm-v { font-weight: 800; font-size: 14px; color: #0b0b0f; }
        .cm-k { font-size: 8.5px; font-weight: 700; letter-spacing: .08em; color: #9a9ea3; margin-top: 2px; }
        .cm-tap { display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(255,90,31,.12); color: #d6480f; border-radius: 10px; padding: 8px; font-size: 11px; font-weight: 800; }
        .cm-ck { width: 15px; height: 15px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; flex: 0 0 auto; }
        .cm-ck svg { width: 9px; height: 9px; display: block; }


        /* ===== HOVER ===== */
        .cm-track:has(.cm-card:hover) .cm-card:not(:hover) { opacity: .3; filter: blur(3px) saturate(.7); transform: translateY(0) scale(.95); }
        .cm-card:hover {
          transform: translateY(0) translateZ(150px) scale(1.33) !important; z-index: 20;
          box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 70px 110px -30px rgba(11,11,15,.6), 0 30px 60px -20px rgba(255,90,31,.3);
        }
        .cm-card:hover .cm-photo { transform: scale(1.16) translateY(-7%); }
        .cm-card:hover .cm-dim { opacity: 1; }
        .cm-card:hover .cm-scan { animation: cm-scan .9s cubic-bezier(.4,0,.2,1) .3s forwards; }
        @keyframes cm-scan { 0% { opacity: 0; transform: translateY(-120%); } 15% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; transform: translateY(150%); } }
        .cm-card:hover .cm-phone { transform: translateX(-50%) translateY(0); }
        .cm-card:hover .cm-scr-inner { transform: translateY(0); opacity: 1; }
        .cm-card:hover .cm-scr-img { transform: translateY(0); opacity: 1; }
        .cm-card:hover .cm-cap { opacity: 1; transform: translateY(0); transition-delay: 1.3s; }
        .cm-card:hover .cm-rings i { animation: cm-ripple 2.2s ease-out infinite; }
        .cm-card:hover .cm-rings i:nth-child(1) { animation-delay: 1.6s; }
        .cm-card:hover .cm-rings i:nth-child(2) { animation-delay: 2.3s; }
        .cm-card:hover .cm-rings i:nth-child(3) { animation-delay: 3.0s; }
        @keyframes cm-ripple { 0% { opacity: 0; transform: scale(.3); } 14% { opacity: .8; } 100% { opacity: 0; transform: scale(2.2); } }

        @media (prefers-reduced-motion: reduce) {
          .cm-track { animation: none; }
          .cm-card, .cm-photo, .cm-phone, .cm-scr-inner, .cm-cap, .cm-stars { transition: none; }
          .cm-card:hover { transform: translateZ(110px) scale(1.22) !important; }
          .cm-card:hover .cm-phone { transform: translateX(-50%) translateY(0); }
          .cm-card:hover .cm-scr-inner { opacity: 1; transform: none; }
          .cm-card:hover .cm-scr-img { opacity: 1; transform: none; }
          .cm-card:hover .cm-scan, .cm-card:hover .cm-rings i { animation: none; }
        }
      
        @media (max-width: 640px) {
          .cm-card { width: 230px; height: 230px; border-radius: 18px; }
          .cm-group { gap: 14px; padding-left: 14px; }
          .cm-section { padding-left: 4px; padding-right: 4px; }
          .cm-head > * { max-width: 100%; }
          .cm-card:nth-child(odd) { transform: translateY(-6px); }
          .cm-card:nth-child(even) { transform: translateY(6px); }
          .cm-phone { transform: scale(0.7); }
        }
      `}</style>
    </section>
  );
}

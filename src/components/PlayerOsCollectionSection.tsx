/**
 * Emblem homepage — PLAYER OS collection section.
 *
 * Replaces the old drag-to-unlock / scroll-pinned "THE DIGITAL PROFILE"
 * lock-screen walkthrough (removed) with a static, always-visible dark
 * archival "season collection" — a horizontal row of illustrative chapters
 * (first card, matchday memories, coach recognition, milestones, awards,
 * and an unfinished future chapter).
 *
 * Deliberately a plain server component: no drag state, no scroll listener,
 * no IntersectionObserver, no client-only hooks. The horizontal collection
 * on narrow viewports is a native CSS scroll-snap row — zero JS, no new
 * animation dependency, keyboard-scrollable by giving the row itself a
 * tabIndex and a11y label.
 *
 * Content is a single CHAPTERS array rendered once; CSS alone reflows it
 * between the desktop two-column layout and the mobile/tablet horizontal
 * scroller, so chapter copy is never duplicated in the markup.
 *
 * Imagery: First Card and Matchday Memories reuse existing, already-approved
 * marketing photos already used elsewhere on this same homepage
 * (seed-jacob.png, coachos-moment-goal.png — see src/app/page.tsx).
 *
 * Coach Recognition, Milestones and Awards use three new synthetic marketing
 * photos (public/assets/marketing/player-os-*.png) — supplied directly by
 * the site owner for this purpose, trimmed to their real content bounds
 * (no crop marks/canvas padding) but otherwise unedited. No real child's
 * photo is used anywhere in this file; every image is either a pre-existing
 * approved asset or an owner-supplied synthetic one added for this section
 * specifically.
 */

const ORANGE = 'var(--accent, #ff5a1f)';

const font = {
  cond: 'var(--font-jbmono), monospace',
  display: 'var(--font-sora), system-ui, sans-serif',
  body: 'var(--font-manrope), system-ui, sans-serif',
  hand: 'var(--font-caveat), "Segoe Print", "Comic Sans MS", cursive',
};

type Chapter = {
  id: string;
  title: string;
  /** Real, already-approved marketing photo — null for the two chapters
   *  with no matching asset in the repo (see file header). */
  photo: { src: string; alt: string } | null;
  /** Primary label line shown on the dark paper tile under the photo. */
  label: string;
  /** Secondary line — a date, or (Coach Recognition) the coach's name. */
  meta?: string;
  /** Handwritten-style label (Matchday Memories' note) uses the brand's
   *  existing --font-caveat token rather than the default label font. */
  handwritten?: boolean;
  /** Small decorative corner mark — a foil-style stamp or a crown, both
   *  purely decorative (never the only carrier of meaning: every chapter
   *  already has a text title and label). */
  mark?: 'stamp' | 'crown';
  /** First Card conceptually IS a physical Emblem trading card, so it gets
   *  a graded-slab treatment (an offset card peeking out behind it) —
   *  every other chapter is a candid photo taped into the album, no slab. */
  slab?: boolean;
};

const CHAPTERS: Chapter[] = [
  {
    id: 'first-card',
    title: 'FIRST CARD',
    photo: { src: '/seed-jacob.png', alt: 'Portrait photo used to illustrate a player’s first Emblem card' },
    label: 'First card',
    meta: '12.08.2024',
    mark: 'stamp',
    slab: true,
  },
  {
    id: 'matchday-memories',
    title: 'MATCHDAY MEMORIES',
    photo: { src: '/assets/marketing/coachos-moment-goal.png', alt: 'Matchday action photo used to illustrate a captured football memory' },
    label: 'Good football brings good people.',
    meta: '28.09.2024',
    handwritten: true,
  },
  {
    id: 'coach-recognition',
    title: 'COACH RECOGNITION',
    photo: { src: '/assets/marketing/player-os-coach-recognition.png', alt: 'Coach and player photo used to illustrate coach recognition' },
    label: 'Strong attitude. Leads by example.',
    meta: 'Coach Taylor · 14.11.2024',
  },
  {
    id: 'milestones',
    title: 'MILESTONES',
    photo: { src: '/assets/marketing/player-os-milestones.png', alt: 'Player photo, viewed from behind at sunset, used to illustrate a season milestone' },
    label: '50 APPEARANCES',
    meta: '03.02.2025',
  },
  {
    id: 'awards',
    title: 'AWARDS',
    photo: { src: '/assets/marketing/player-os-awards.png', alt: 'Player holding a trophy, used to illustrate an award' },
    label: 'PLAYER OF THE MONTH',
    meta: 'APR 2025',
    mark: 'crown',
  },
];

function PhotoMount({ chapter }: { chapter: Chapter }) {
  return (
    <div className={`pos-mount-wrap${chapter.slab ? ' pos-mount-wrap--slab' : ''}`}>
      <div className="pos-mount" aria-hidden={chapter.photo ? undefined : true}>
        <span className="pos-tape pos-tape-l" aria-hidden="true" />
        <span className="pos-tape pos-tape-r" aria-hidden="true" />
        {chapter.photo ? (
          <img className="pos-photo" src={chapter.photo.src} alt={chapter.photo.alt} loading="lazy" decoding="async" />
        ) : (
          <div className="pos-placeholder" role="img" aria-label={`Placeholder image — no ${chapter.title.toLowerCase()} photo asset is available yet`}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2.2" />
              <circle cx="9" cy="9.5" r="1.6" />
              <path d="M4 17l4.5-4.5 3 3L16 11l4 5" />
            </svg>
            <span>Photo coming soon</span>
          </div>
        )}
        {chapter.mark === 'stamp' && (
          <span className="pos-mark pos-mark-stamp" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
          </span>
        )}
        {chapter.mark === 'crown' && (
          <span className="pos-mark pos-mark-crown" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 5.5-6 5.5 6 3-3-2 9h-13z" /></svg>
          </span>
        )}
      </div>
    </div>
  );
}

function ChapterLabel({ chapter }: { chapter: Chapter }) {
  return (
    <div className="pos-label">
      <p className="pos-label-line" style={chapter.handwritten ? { fontFamily: font.hand, fontSize: 17 } : undefined}>
        {chapter.label}
      </p>
      {chapter.meta && <p className="pos-label-meta">{chapter.meta}</p>}
    </div>
  );
}

export default function PlayerOsCollectionSection() {
  return (
    <section
      id="player-os"
      aria-labelledby="player-os-heading"
      style={{
        position: 'relative',
        background: 'radial-gradient(900px 480px at 6% 0%, rgba(233,116,53,.14), transparent 62%), linear-gradient(180deg, #0b0b0a 0%, #100e0c 100%)',
        borderTop: '1px solid rgba(255,255,255,.07)',
        color: '#F4F0E9',
        overflow: 'hidden',
      }}
    >
      {/* Raw CSS injected via dangerouslySetInnerHTML, not a plain JSX text
          child — a literal `{`...`}`</style>` text node gets HTML-entity-
          escaped by React's SSR serialiser wherever it contains a quote
          character (e.g. the content:'' pseudo-element below), which then
          mismatches the client's raw DOM text and triggers a hydration
          error. dangerouslySetInnerHTML is the standard, correct way to
          inject literal, static CSS without that text-node diffing. */}
      <style dangerouslySetInnerHTML={{ __html: `
        #player-os .pos-inner { max-width: 1360px; margin: 0 auto; padding: clamp(56px,7vw,96px) 24px; display: grid; grid-template-columns: minmax(230px,280px) minmax(0,1fr); gap: clamp(28px,3.5vw,44px); align-items: start; }
        #player-os .pos-intro-eyebrow { display: flex; align-items: center; gap: 9px; font-family: ${font.cond}; font-weight: 700; letter-spacing: .22em; font-size: 12.5px; color: ${ORANGE}; margin: 0 0 16px; }
        #player-os .pos-intro-eyebrow::before { content: ''; width: 7px; height: 7px; border-radius: 999px; background: ${ORANGE}; flex-shrink: 0; }
        #player-os h2 { font-family: ${font.display}; font-weight: 800; font-size: clamp(36px,4.6vw,54px); line-height: 1.02; letter-spacing: -.01em; margin: 0 0 18px; color: #F7F3EC; text-wrap: balance; }
        #player-os .pos-intro-body { font-family: ${font.body}; font-size: 16.5px; line-height: 1.65; color: #B4AC9F; margin: 0 0 22px; max-width: 42ch; }
        #player-os .pos-intro-rule { width: 30px; height: 2px; background: ${ORANGE}; margin: 0 0 14px; border: 0; }
        #player-os .pos-intro-tag { font-family: ${font.cond}; font-size: 11px; font-weight: 600; letter-spacing: .12em; color: #8B8478; line-height: 1.7; margin: 0; text-transform: uppercase; }
        #player-os .pos-handwritten-note { font-family: ${font.hand}; font-size: 20px; line-height: 1.25; color: rgba(180,172,159,.5); margin: 26px 0 0; transform: rotate(-4deg); transform-origin: left center; }
        #player-os .pos-brandline { display: flex; align-items: center; gap: 12px; margin-top: 28px; font-family: ${font.cond}; font-size: 10.5px; font-weight: 600; letter-spacing: .3em; color: #6E6558; text-transform: uppercase; }
        #player-os .pos-brandline-rule { width: 26px; height: 1px; background: rgba(255,255,255,.18); }
        /* Above 1300px there's genuine spare whitespace at the section's
           bottom-right (matching the design reference's own placement) — on
           anything narrower that space doesn't reliably exist, so the line
           stays in normal flow under the intro instead of ever risking an
           overlap with the collection panel. */
        @media (min-width: 1300px) {
          #player-os .pos-brandline { position: absolute; right: clamp(24px,3vw,48px); bottom: 26px; margin-top: 0; }
        }
        #player-os .pos-season-head { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin: 0 0 18px; font-family: ${font.cond}; font-size: 11.5px; font-weight: 600; letter-spacing: .2em; color: #9C9486; }
        #player-os .pos-season-head strong { color: #D8D2C6; font-weight: 600; }
        #player-os .pos-season-rule { flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, rgba(255,255,255,.02), rgba(255,255,255,.18)); }
        #player-os .pos-collection { position: relative; border: 1px solid rgba(239,140,76,.35); border-radius: 22px; background: linear-gradient(180deg, #1a1712 0%, #100e0b 100%); box-shadow: 0 30px 60px -30px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.03); isolation: isolate; }
        #player-os .pos-collection::before { content: ''; position: absolute; inset: 0; border-radius: inherit; opacity: .7; mix-blend-mode: overlay; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E"); }
        #player-os .pos-collection::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(140% 90% at 0% 0%, rgba(239,140,76,.10), transparent 55%); }
        #player-os .pos-row { display: flex; list-style: none; margin: 0; padding: 0; position: relative; z-index: 1; }
        #player-os .pos-chapter { flex: 1 1 0; min-width: 0; padding: 22px 16px; position: relative; }
        #player-os .pos-chapter + .pos-chapter { border-left: 1px solid rgba(255,255,255,.08); }
        #player-os .pos-chapter h3 { font-family: ${font.display}; font-weight: 800; font-size: 15px; letter-spacing: -.005em; color: #F4F0E9; margin: 0 0 6px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,.14); text-transform: uppercase; }
        #player-os .pos-mount-wrap { position: relative; margin-top: 20px; }
        #player-os .pos-mount-wrap--slab::before { content: ''; position: absolute; top: 8px; bottom: -6px; right: -10px; left: 8px; border-radius: 6px; background: linear-gradient(160deg, rgba(239,140,76,.9), rgba(150,72,32,.55)); box-shadow: 0 10px 22px -10px rgba(0,0,0,.8); z-index: 0; }
        #player-os .pos-mount { position: relative; z-index: 1; border-radius: 6px; background: #050403; border: 1px solid rgba(0,0,0,.6); box-shadow: 0 14px 26px -14px rgba(0,0,0,.75); overflow: hidden; aspect-ratio: 3/4; }
        #player-os .pos-photo { width: 100%; height: 100%; object-fit: cover; object-position: center 18%; display: block; filter: saturate(1.02) contrast(1.02); }
        #player-os .pos-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: rgba(200,190,175,.55); background: radial-gradient(120% 90% at 50% 30%, #2a231a 0%, #171310 55%, #0c0a08 100%); font-family: ${font.cond}; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
        #player-os .pos-placeholder svg { opacity: .6; }
        #player-os .pos-tape { position: absolute; top: -7px; width: 46px; height: 20px; background: linear-gradient(115deg, rgba(226,221,212,.24) 0%, rgba(226,221,212,.1) 40%, rgba(226,221,212,.22) 60%, rgba(226,221,212,.09) 100%); border: 1px solid rgba(255,255,255,.15); box-shadow: 0 2px 6px rgba(0,0,0,.35); transform: rotate(-3deg); z-index: 2; backdrop-filter: blur(2px); }
        #player-os .pos-tape-l { left: 10px; }
        #player-os .pos-tape-r { right: 10px; transform: rotate(3deg); }
        #player-os .pos-mark { position: absolute; right: 8px; bottom: 8px; z-index: 3; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgba(11,10,9,.72); border: 1.5px solid rgba(239,140,76,.7); color: ${ORANGE}; box-shadow: 0 6px 16px -6px rgba(0,0,0,.8); }
        #player-os .pos-label { margin-top: 12px; background: #1d1a15; border: 1px solid rgba(255,255,255,.08); border-radius: 0 0 4px 4px; padding: 16px 12px 10px; transform: rotate(-0.6deg); box-shadow: 0 8px 16px -10px rgba(0,0,0,.6); clip-path: polygon(0% 7%, 7% 1%, 15% 5%, 23% 0%, 31% 6%, 39% 1%, 47% 4%, 55% 0%, 63% 5%, 71% 2%, 79% 6%, 87% 1%, 94% 4%, 100% 0%, 100% 100%, 0% 100%); }
        #player-os .pos-label-line { font-family: ${font.body}; font-weight: 700; font-size: 13.5px; line-height: 1.35; color: #F1ECE2; margin: 0; }
        #player-os .pos-label-meta { font-family: ${font.cond}; font-size: 10.5px; letter-spacing: .05em; color: #9C9486; margin: 5px 0 0; }
        #player-os .pos-future { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; height: 100%; min-height: 260px; border: 1px dashed rgba(255,255,255,.22); border-radius: 12px; margin-top: 16px; padding: 22px 14px; gap: 12px; }
        #player-os .pos-future-icon { display: grid; place-items: center; width: 46px; height: 46px; color: #8B8478; }
        #player-os .pos-future-title { font-family: ${font.body}; font-size: 13.5px; line-height: 1.5; color: #C9C2B4; margin: 0; max-width: 20ch; }
        #player-os .pos-future-rule { width: 32px; height: 1px; background: rgba(255,255,255,.18); }
        #player-os .pos-future-more { font-family: ${font.hand}; font-size: 18px; color: #8B8478; margin: 0; }
        #player-os .pos-row:focus-visible { outline: 2px solid ${ORANGE}; outline-offset: 4px; border-radius: 22px; }
        #player-os .pos-sr-desc { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (max-width: 1024px) {
          #player-os .pos-inner { grid-template-columns: minmax(0,1fr); }
          #player-os .pos-intro-body { max-width: 60ch; }
          #player-os .pos-season-head { justify-content: space-between; }
          #player-os .pos-row { overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-left: 20px; -webkit-overflow-scrolling: touch; }
          #player-os .pos-chapter { min-width: 200px; scroll-snap-align: start; }
        }

        @media (max-width: 640px) {
          #player-os .pos-inner { padding: 44px 18px 52px; gap: 28px; }
          #player-os h2 { font-size: clamp(32px,9vw,40px); }
          #player-os .pos-row { scroll-snap-type: x mandatory; scroll-padding-left: 18px; }
          #player-os .pos-chapter { min-width: 78vw; scroll-snap-align: center; }
          #player-os .pos-chapter:last-child { min-width: 70vw; }
        }

        @media (prefers-reduced-motion: reduce) {
          #player-os .pos-row { scroll-behavior: auto; }
        }
      ` }} />

      <div className="pos-inner">
        <div>
          <p id="player-os-heading" className="pos-intro-eyebrow">PLAYER OS</p>
          <h2>Their season, collected.</h2>
          <p className="pos-intro-body">
            From first appearances and matchday memories to coach recognition and personal milestones, Player OS brings their football journey together season by season.
          </p>
          <hr className="pos-intro-rule" aria-hidden="true" />
          <p className="pos-intro-tag">More than a season.<br />A brighter tomorrow.</p>
          <p className="pos-handwritten-note">Small moments.<br />Big futures.</p>
          <p className="pos-brandline">
            <span className="pos-brandline-rule" aria-hidden="true" />
            Play. Remember. Belong.
          </p>
        </div>

        <div>
          <div className="pos-season-head">
            <span>SEASON COLLECTION</span>
            <span className="pos-season-rule" aria-hidden="true" />
            <strong>2026 / 2027</strong>
          </div>

          <div className="pos-collection">
            <p className="pos-sr-desc">
              A horizontally scrollable collection of six chapters: First Card, Matchday Memories, Coach Recognition, Milestones, Awards, and a final, not-yet-written chapter. Scroll or swipe to browse; each chapter is illustrative homepage content.
            </p>
            <ol
              className="pos-row"
              tabIndex={0}
              role="region"
              aria-label="Season collection chapters, scrollable"
            >
              {CHAPTERS.map((chapter) => (
                <li key={chapter.id} className="pos-chapter">
                  <h3>{chapter.title}</h3>
                  <PhotoMount chapter={chapter} />
                  <ChapterLabel chapter={chapter} />
                </li>
              ))}

              <li className="pos-chapter" aria-label="Future chapter, not yet available">
                <h3>WHAT&rsquo;S NEXT</h3>
                <div className="pos-future">
                  <span className="pos-future-icon" aria-hidden="true">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2.5l8.2 4.7v9.6L12 21.5l-8.2-4.7V7.2z" />
                      <path d="M12 8l1.4 3 3.1.4-2.3 2.2.6 3.1L12 15.2l-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" />
                    </svg>
                  </span>
                  <p className="pos-future-title">The next chapter hasn&rsquo;t happened yet.</p>
                  <span className="pos-future-rule" aria-hidden="true" />
                  <p className="pos-future-more">More to come&hellip;</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

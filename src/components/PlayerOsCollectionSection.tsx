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
 * All copy and chapter data lives in SEASON_COLLECTION_DEMO below and is
 * rendered once from that single array — CSS alone reflows it between the
 * desktop two-column layout and the mobile/tablet horizontal scroller, so
 * chapter content is never duplicated in the markup.
 *
 * Imagery: all five photo chapters (public/assets/marketing/player-os-*.png)
 * are synthetic marketing photos supplied directly by the site owner for
 * this section, trimmed to their real content bounds (no crop marks/canvas
 * padding) but otherwise unedited. No real child's photo is used anywhere
 * in this file.
 *
 * These were supplied as individually-isolated layers (one photo per file,
 * each on its own oversized transparent canvas at its original absolute
 * position) alongside a separate full-panel background/texture layer. Only
 * the photo layers are used as raster images here — the background,
 * tape, torn-label and divider treatment are all real CSS below, not the
 * supplied raster layers, because those were authored at one fixed pixel
 * canvas and don't reflow: same reasoning as this file's own "no flattened
 * screenshot" constraint, just discovered again one layer at a time. CSS
 * lets every one of those elements resize, reflow and restack correctly
 * from 320px up to a 1440px+ desktop; a fixed background raster with
 * absolutely-positioned overlays on top would only ever look right at the
 * one canvas size it was authored for.
 */

const ORANGE = 'var(--accent, #ff5a1f)';

const font = {
  cond: 'var(--font-jbmono), monospace',
  display: 'var(--font-sora), system-ui, sans-serif',
  body: 'var(--font-manrope), system-ui, sans-serif',
  hand: 'var(--font-caveat), "Segoe Print", "Comic Sans MS", cursive',
};

type Photo = { src: string; alt: string };

/** A moment that has already happened this season — full-intensity photo,
 *  tape, torn-paper label, a real recorded date. */
type CompletedChapter = {
  id: string;
  state: 'completed';
  heading: string;
  photo: Photo;
  label: string;
  /** Shown alongside the date on one meta line (Coach Recognition only). */
  supportingCopy?: string;
  date: string;
  handwritten?: boolean;
  mark?: 'stamp';
  /** Real torn-paper label tile texture (owner-supplied), used only for
   *  completed chapters — reinforcing "already collected" the same way the
   *  muted/dashed treatment reinforces "upcoming" below. */
  labelTexture?: string;
  /** A tiny extra tape/note accent overlapping the label — Matchday only,
   *  matching its already-handwritten note. */
  noteAccent?: boolean;
};

/** A moment expected later this season — same photo mount, but visibly not
 *  yet collected: muted image, dashed border, an eyebrow instead of a
 *  date, no filled badge. Never marked disabled/unavailable — still fully
 *  readable and keyboard-reachable, just styled as "anticipated." */
type UpcomingChapter = {
  id: string;
  state: 'upcoming';
  heading: string;
  photo: Photo;
  eyebrow: string;
  label: string;
  supportingCopy?: string;
  /** Awards' crown becomes an outline mark here — never a solid/filled
   *  badge, which would read as already-won. */
  outlineMark?: 'crown';
};

/** The open-ended final chapter — no photo, no date, nothing collected
 *  yet. The most incomplete of the three states by design. */
type FutureChapter = {
  id: string;
  state: 'future';
  heading: string;
  title: string;
  more: string;
};

type Chapter = CompletedChapter | UpcomingChapter | FutureChapter;

/**
 * Static synthetic homepage demonstration content — not read from any
 * order, player profile or database. Every date below is hand-picked to
 * read as "this season, already happened" (completed chapters) or
 * deliberately has no date at all (upcoming/future chapters); nothing here
 * is derived from the system clock, so the story stays internally
 * coherent regardless of when the page is actually viewed. Review and
 * update this whole object together (never just one date/label in
 * isolation) whenever the featured season changes.
 */
const SEASON_COLLECTION_DEMO: {
  seasonLabel: string;
  seasonRange: string;
  chapters: Chapter[];
} = {
  seasonLabel: 'SEASON COLLECTION',
  seasonRange: '2026 / 2027',
  chapters: [
    {
      id: 'first-card',
      state: 'completed',
      heading: 'FIRST CARD',
      photo: { src: '/assets/marketing/player-os-first-card.png', alt: 'Portrait photo, styled as a graded trading card, used to illustrate a player’s first Emblem card' },
      label: 'First card',
      date: '12.08.2026',
      mark: 'stamp',
      labelTexture: '/assets/marketing/player-os-label-first-card.png',
      // This photo already has the card-holder/slab edge baked into it
      // (owner-supplied), so it needs no extra CSS treatment for that effect.
    },
    {
      id: 'matchday-memories',
      state: 'completed',
      heading: 'MATCHDAY MEMORIES',
      photo: { src: '/assets/marketing/player-os-matchday.png', alt: 'Matchday action photo used to illustrate a captured football memory' },
      label: 'Good football brings good people.',
      date: '30.08.2026',
      handwritten: true,
      labelTexture: '/assets/marketing/player-os-label-matchday.png',
      noteAccent: true,
    },
    {
      id: 'coach-recognition',
      state: 'completed',
      heading: 'COACH RECOGNITION',
      photo: { src: '/assets/marketing/player-os-coach-recognition.png', alt: 'Coach and player photo used to illustrate coach recognition' },
      label: 'Strong attitude. Leads by example.',
      supportingCopy: 'Coach Taylor',
      date: '05.09.2026',
      labelTexture: '/assets/marketing/player-os-label-coach.png',
    },
    {
      id: 'milestones',
      state: 'upcoming',
      heading: 'MILESTONES',
      photo: { src: '/assets/marketing/player-os-milestones.png', alt: 'Player photo, viewed from behind at sunset, used to illustrate a season milestone still to come' },
      eyebrow: 'NEXT MILESTONE',
      label: '50 APPEARANCES',
      supportingCopy: 'Still to come',
    },
    {
      id: 'awards',
      state: 'upcoming',
      heading: 'AWARDS',
      photo: { src: '/assets/marketing/player-os-awards.png', alt: 'Player photo used to illustrate an award still to be won this season' },
      eyebrow: 'NEXT AWARD',
      label: 'Waiting for their next achievement.',
      outlineMark: 'crown',
    },
    {
      id: 'whats-next',
      state: 'future',
      heading: 'WHAT’S NEXT',
      title: 'The next chapter hasn’t happened yet.',
      more: 'More to come…',
    },
  ],
};

/** Visually-hidden, unambiguous state text for screen-reader users — the
 *  visible copy already implies state (a real date vs. "Still to come" vs.
 *  "hasn't happened yet"), but this makes it explicit rather than implied. */
function stateAnnouncement(state: Chapter['state']): string {
  if (state === 'completed') return 'Completed.';
  if (state === 'upcoming') return 'Upcoming.';
  return 'Not yet started.';
}

function StampMark() {
  return (
    <span className="pos-mark pos-mark-stamp" aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
    </span>
  );
}

/** Always the outline variant — Awards is the only chapter that uses this
 *  mark, and it's always in the `upcoming` state (see the doc comment on
 *  UpcomingChapter's outlineMark: a filled crown would read as already won). */
function CrownMark() {
  return (
    <span className="pos-mark pos-mark-crown pos-mark--outline" aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 5.5-6 5.5 6 3-3-2 9h-13z" /></svg>
    </span>
  );
}

function PhotoMount({ chapter }: { chapter: CompletedChapter | UpcomingChapter }) {
  const upcoming = chapter.state === 'upcoming';
  return (
    <div className="pos-mount-wrap">
      <div className={`pos-mount${upcoming ? ' pos-mount--upcoming' : ''}`}>
        <span className={`pos-tape pos-tape-l${upcoming ? ' pos-tape--faint' : ''}`} aria-hidden="true" />
        <span className={`pos-tape pos-tape-r${upcoming ? ' pos-tape--faint' : ''}`} aria-hidden="true" />
        <img className={`pos-photo${upcoming ? ' pos-photo--muted' : ''}`} src={chapter.photo.src} alt={chapter.photo.alt} loading="lazy" decoding="async" />
        {chapter.state === 'completed' && chapter.mark === 'stamp' && <StampMark />}
        {chapter.state === 'upcoming' && chapter.outlineMark === 'crown' && <CrownMark />}
      </div>
      {chapter.state === 'completed' && chapter.noteAccent && <span className="pos-tape-note" aria-hidden="true" />}
    </div>
  );
}

function ChapterLabel({ chapter }: { chapter: CompletedChapter | UpcomingChapter }) {
  const upcoming = chapter.state === 'upcoming';
  const texture = chapter.state === 'completed' ? chapter.labelTexture : undefined;
  return (
    <div
      className={`pos-label${upcoming ? ' pos-label--upcoming' : ''}`}
      style={texture ? { backgroundImage: `url('${texture}')` } : undefined}
    >
      {upcoming && <p className="pos-label-eyebrow">{chapter.eyebrow}</p>}
      <p
        className="pos-label-line"
        style={chapter.state === 'completed' && chapter.handwritten ? { fontFamily: font.hand, fontSize: 17 } : undefined}
      >
        {chapter.label}
      </p>
      {chapter.state === 'completed' && (
        <p className="pos-label-meta">{chapter.supportingCopy ? `${chapter.supportingCopy} · ${chapter.date}` : chapter.date}</p>
      )}
      {chapter.state === 'upcoming' && chapter.supportingCopy && (
        <p className="pos-label-status">{chapter.supportingCopy}</p>
      )}
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
        #player-os .pos-mount { position: relative; border-radius: 6px; background: #050403; border: 1px solid rgba(0,0,0,.6); box-shadow: 0 14px 26px -14px rgba(0,0,0,.75); overflow: hidden; aspect-ratio: 3/4; }
        /* Upcoming: dashed, lighter border instead of a solid archived-photo
           mount — one of several non-colour signals (with the muted photo
           filter and the eyebrow/status text) that this hasn't happened yet. */
        #player-os .pos-mount--upcoming { border: 1px dashed rgba(255,255,255,.28); box-shadow: none; }
        #player-os .pos-photo { width: 100%; height: 100%; object-fit: cover; object-position: center 18%; display: block; filter: saturate(1.02) contrast(1.02); }
        #player-os .pos-photo--muted { filter: saturate(.5) brightness(.82) contrast(.94); }
        #player-os .pos-tape { position: absolute; top: -7px; width: 46px; height: 20px; background-image: url('/assets/marketing/player-os-tape-a.png'); background-size: cover; background-position: center; box-shadow: 0 2px 6px rgba(0,0,0,.35); transform: rotate(-3deg); z-index: 2; opacity: .92; }
        /* Upcoming: a smaller, plainer tape scrap and lower opacity — one
           more non-colour signal (with the dashed border and muted photo)
           that this hasn't actually been stuck into the album yet. */
        #player-os .pos-tape--faint { background-image: url('/assets/marketing/player-os-tape-b.png'); opacity: .4; }
        /* Sits on pos-mount-wrap (not inside the clipped/torn pos-label),
           at the seam where the photo meets its label. */
        #player-os .pos-tape-note { position: absolute; bottom: -6px; left: 50%; width: 34px; height: 16px; background-image: url('/assets/marketing/player-os-tape-note.png'); background-size: cover; background-position: center; transform: translateX(-50%) rotate(2deg); z-index: 4; opacity: .95; }
        #player-os .pos-tape-l { left: 10px; }
        #player-os .pos-tape-r { right: 10px; transform: rotate(3deg); }
        #player-os .pos-mark { position: absolute; right: 8px; bottom: 8px; z-index: 3; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgba(11,10,9,.72); border: 1.5px solid rgba(239,140,76,.7); color: ${ORANGE}; box-shadow: 0 6px 16px -6px rgba(0,0,0,.8); }
        /* Outline mark (Awards, upcoming): no filled backing at all — a
           ring only, so it can never be mistaken for an award already won. */
        /* A faint dark scrim (never a solid fill) keeps the ring readable
           regardless of what's behind it in the photo — still clearly "not
           a filled badge," just enough contrast to stay visible. */
        #player-os .pos-mark--outline { background: rgba(5,4,3,.4); border: 1.5px dashed rgba(239,140,76,.8); color: rgba(239,140,76,.95); box-shadow: 0 2px 8px rgba(0,0,0,.4); backdrop-filter: blur(1px); }
        #player-os .pos-label { position: relative; margin-top: 12px; background-color: #1d1a15; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.08); border-radius: 0 0 4px 4px; padding: 16px 12px 10px; transform: rotate(-0.6deg); box-shadow: 0 8px 16px -10px rgba(0,0,0,.6); clip-path: polygon(0% 7%, 7% 1%, 15% 5%, 23% 0%, 31% 6%, 39% 1%, 47% 4%, 55% 0%, 63% 5%, 71% 2%, 79% 6%, 87% 1%, 94% 4%, 100% 0%, 100% 100%, 0% 100%); }
        #player-os .pos-label--upcoming { background: #17140f; border: 1px dashed rgba(255,255,255,.14); box-shadow: none; }
        #player-os .pos-label-eyebrow { font-family: ${font.cond}; font-weight: 700; font-size: 10px; letter-spacing: .16em; color: rgba(239,140,76,.75); margin: 0 0 6px; text-transform: uppercase; }
        #player-os .pos-label-line { font-family: ${font.body}; font-weight: 700; font-size: 13.5px; line-height: 1.35; color: #F1ECE2; margin: 0; }
        #player-os .pos-label--upcoming .pos-label-line { color: #D9D2C4; }
        #player-os .pos-label-meta { font-family: ${font.cond}; font-size: 10.5px; letter-spacing: .05em; color: #9C9486; margin: 5px 0 0; }
        #player-os .pos-label-status { font-family: ${font.cond}; font-size: 10.5px; font-style: italic; letter-spacing: .05em; color: #8B8478; margin: 5px 0 0; }
        #player-os .pos-future { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; height: 100%; min-height: 260px; border: 1px dashed rgba(255,255,255,.22); border-radius: 12px; margin-top: 16px; padding: 22px 14px; gap: 12px; }
        #player-os .pos-future-icon { display: grid; place-items: center; width: 46px; height: 46px; color: #8B8478; }
        #player-os .pos-future-title { font-family: ${font.body}; font-size: 13.5px; line-height: 1.5; color: #C9C2B4; margin: 0; max-width: 20ch; }
        #player-os .pos-future-rule { width: 32px; height: 1px; background: rgba(255,255,255,.18); }
        #player-os .pos-future-more { font-family: ${font.hand}; font-size: 18px; color: #8B8478; margin: 0; }
        #player-os .pos-row:focus-visible { outline: 2px solid ${ORANGE}; outline-offset: 4px; border-radius: 22px; }
        #player-os .pos-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

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
            Tap their Emblem card to open Player OS&mdash;a private digital profile where families save matchday memories and coaches add verified recognition, milestones and awards. Their football story grows with them, season by season.
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
            <span>{SEASON_COLLECTION_DEMO.seasonLabel}</span>
            <span className="pos-season-rule" aria-hidden="true" />
            <strong>{SEASON_COLLECTION_DEMO.seasonRange}</strong>
          </div>

          <div className="pos-collection">
            <p className="pos-sr-only">
              A horizontally scrollable collection of six chapters: First Card, Matchday Memories and Coach Recognition (already collected this season), Milestones and Awards (still to come), and a final chapter that hasn&rsquo;t started yet. Scroll or swipe to browse; each chapter is illustrative homepage content.
            </p>
            <ol
              className="pos-row"
              tabIndex={0}
              role="region"
              aria-label="Season collection chapters, scrollable"
            >
              {SEASON_COLLECTION_DEMO.chapters.map((chapter) => (
                <li key={chapter.id} className="pos-chapter">
                  <h3>{chapter.heading}</h3>
                  <span className="pos-sr-only">{stateAnnouncement(chapter.state)}</span>
                  {chapter.state === 'future' ? (
                    <div className="pos-future">
                      <span className="pos-future-icon" aria-hidden="true">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2.5l8.2 4.7v9.6L12 21.5l-8.2-4.7V7.2z" />
                          <path d="M12 8l1.4 3 3.1.4-2.3 2.2.6 3.1L12 15.2l-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" />
                        </svg>
                      </span>
                      <p className="pos-future-title">{chapter.title}</p>
                      <span className="pos-future-rule" aria-hidden="true" />
                      <p className="pos-future-more">{chapter.more}</p>
                    </div>
                  ) : (
                    <>
                      <PhotoMount chapter={chapter} />
                      <ChapterLabel chapter={chapter} />
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

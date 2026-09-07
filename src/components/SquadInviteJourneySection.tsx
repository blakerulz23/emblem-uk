import Link from 'next/link';
import SquadInviteCopyLinkButton from './SquadInviteCopyLinkButton';

/**
 * Emblem homepage — "For Coaches & Teams" section.
 *
 * Replaces the previous bulk-upload/single-organiser "Order Session ->
 * Coach OS" narrative with Emblem's current, safer model: one organiser
 * starts a Squad Invite; each family builds and confirms its own child's
 * card; the organiser only ever sees aggregate progress, never a real
 * roster of names/photos/guardians; completed cards are printed and
 * delivered together once the squad target is reached.
 *
 * Static synthetic homepage demonstration content — every name, date,
 * status, count and photo below is illustrative marketing material, not
 * read from any real Squad Invite, order or database record. The Stage 2
 * family-card photos (squad-invite-family-card-*.png) are owner-approved
 * synthetic marketing personas already used elsewhere on this site, used
 * here to make the illustrative example feel concrete — never real
 * organiser-visible data. A real Squad Invite organiser view still never
 * shows individual child names/photos/guardian details; only this
 * marketing illustration does. Review this whole object together (not
 * just individual fields) if the underlying Squad Invite product flow
 * changes.
 *
 * Plain server component apart from the one genuinely-interactive piece
 * (the demo "copy invite link" button, its own small client island in
 * SquadInviteCopyLinkButton.tsx) — no scroll listeners, no
 * IntersectionObserver, no pinned/locked scroll behaviour. Stage
 * connectors are pure CSS (::after on each stage), not extra DOM nodes,
 * so the three stages stay a genuine 3-item <ol>.
 */

const SQUAD_INVITE_JOURNEY_DEMO = {
  eyebrow: 'FOR COACHES & TEAMS',
  headline: 'One invite. A whole squad connected.',
  supporting:
    'Start a Squad Invite and share it with the team. Each family creates and confirms their own player’s card, while the organiser follows progress and receives the completed squad order together.',
  ctaLabel: 'REQUEST A SQUAD INVITE',
  offerPill: '10+ DIFFERENT PLAYERS UNLOCK FULL-SQUAD PRICING AND A FREE COACH CARD',
  progress: {
    ready: 8,
    target: 10,
    percent: 80,
    label: '8 / 10 PLAYERS READY',
    note: 'Once the squad target is reached and confirmed, we’ll print and deliver the cards together.',
  },
  organiserPanel: {
    label: 'SQUAD INVITE',
    status: 'APPROVED',
    team: 'AFC Oldham U12s',
    deadlineLabel: 'Deadline',
    deadline: '30 SEPT',
    reassurance: 'Share this link with your team’s families. Keep it private.',
  },
  familyTiles: [
    { id: 'confirmed', status: 'CARD CONFIRMED', variant: 'confirmed', photo: '/assets/marketing/squad-invite-family-card-1.png' },
    { id: 'ready', status: 'READY', variant: 'ready', photo: '/assets/marketing/squad-invite-family-card-2.png' },
    { id: 'in-progress', status: 'IN PROGRESS', variant: 'in-progress', photo: '/assets/marketing/squad-invite-family-card-3.png' },
  ] as const,
  stages: [
    {
      id: 'start',
      number: '1',
      heading: 'START THE INVITE',
      description: 'Create your Squad Invite and share the private link with your team’s families.',
    },
    {
      id: 'families',
      number: '2',
      heading: 'FAMILIES BUILD THEIR OWN',
      description: 'Each family creates and confirms their own player’s card, at their own pace.',
      supporting: 'Families complete their own player’s card using the invite link.',
    },
    {
      id: 'delivered',
      number: '3',
      heading: 'DELIVERED TOGETHER',
      description: 'Once the squad target is reached and confirmed, we print and deliver the cards together.',
      supporting: 'A premium set of player cards, delivered together for the squad.',
    },
  ],
};

function OrganiserPanel() {
  const p = SQUAD_INVITE_JOURNEY_DEMO.organiserPanel;
  return (
    <div className="sqi-organiser-panel">
      <span className="sqi-sr-only">Example Squad Invite organiser view —</span>
      <div className="sqi-organiser-head">
        <span className="sqi-organiser-label">{p.label}</span>
        <span className="sqi-organiser-status">{p.status}</span>
      </div>
      <p className="sqi-organiser-team">{p.team}</p>
      <div className="sqi-organiser-deadline">
        <span>{p.deadlineLabel}</span>
        <strong>{p.deadline}</strong>
      </div>
      <SquadInviteCopyLinkButton />
      <p className="sqi-organiser-reassurance">{p.reassurance}</p>
    </div>
  );
}

function FamilyPhoto({ variant, photo }: { variant: 'confirmed' | 'ready' | 'in-progress'; photo: string }) {
  return (
    <span className={`sqi-family-photo-wrap sqi-family-photo-wrap--${variant}`} aria-hidden="true">
      <img className="sqi-family-photo" src={photo} alt="" loading="lazy" decoding="async" />
      {variant === 'confirmed' && (
        <span className="sqi-family-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
      )}
    </span>
  );
}

function FamilyTiles() {
  return (
    <div className="sqi-family-tiles">
      <span className="sqi-sr-only">Example family progress — three sample cards illustrating how each family's own card moves through the journey; not real Squad Invite participants —</span>
      {SQUAD_INVITE_JOURNEY_DEMO.familyTiles.map((tile) => (
        <div key={tile.id} className="sqi-family-tile">
          <FamilyPhoto variant={tile.variant} photo={tile.photo} />
          <span className={`sqi-family-status sqi-family-status--${tile.variant}`}>{tile.status}</span>
        </div>
      ))}
    </div>
  );
}

function CardStack() {
  return (
    <img
      className="sqi-stack-photo"
      src="/assets/marketing/squad-invite-card-stack-box.png"
      alt="A finished set of printed Emblem player cards beside their presentation box"
      loading="lazy"
      decoding="async"
    />
  );
}

export default function SquadInviteJourneySection({
  squadInviteEnabled,
  ctaHref,
}: {
  squadInviteEnabled: boolean;
  ctaHref: string;
}) {
  const { eyebrow, headline, supporting, ctaLabel, offerPill, progress, stages } = SQUAD_INVITE_JOURNEY_DEMO;

  return (
    <section id="squad" className="emh-section sqi-section" aria-labelledby="sqi-heading">
      {/* Raw CSS via dangerouslySetInnerHTML, not a plain JSX text child —
          see PlayerOsCollectionSection.tsx's identical comment for why a
          literal `{`...`}`</style>` text node containing a quote character
          triggers a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sqi-section { position: relative; background: radial-gradient(720px 420px at 82% 18%, rgba(233,116,53,.10), transparent 68%), #fdfcfa; color: #16130f; border-radius: clamp(24px,4vw,40px); }
        .sqi-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; margin: 0 0 40px; }
        .sqi-intro { max-width: 600px; }
        .sqi-intro > p:not(.emh-eyebrow) { margin: 16px 0 0; color: #5f574f; font-size: 16.5px; line-height: 1.65; max-width: 56ch; }
        .sqi-progress { flex: 0 0 auto; width: 100%; max-width: 280px; margin: 2px 0 0; padding: 18px 20px; border: 1px solid rgba(20,17,15,.1); border-radius: 16px; background: #fff; box-shadow: 0 20px 46px -34px rgba(20,17,15,.3); }
        .sqi-progress-percent { display: block; font-family: var(--font-sora), system-ui, sans-serif; font-size: 34px; font-weight: 800; letter-spacing: -0.02em; color: #16130f; line-height: 1; }
        .sqi-progress-label { display: block; font-family: var(--font-jbmono), monospace; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #8b8478; margin: 4px 0 12px; }
        .sqi-progress-track { height: 8px; border-radius: 999px; background: #f0e3d8; overflow: hidden; }
        .sqi-progress-fill { display: block; height: 100%; border-radius: 999px; background: #f1601d; }
        .sqi-progress-note { margin: 10px 0 0; color: #756c62; font-size: 12.5px; line-height: 1.5; }
        .sqi-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; margin-top: 20px; }
        .sqi-cta { min-height: 44px; }
        .sqi-offer { display: inline-flex; align-items: center; max-width: 460px; margin: 0; padding: 8px 16px; border: 1px solid rgba(241,96,29,.4); border-radius: 999px; background: transparent; color: #b3480f; font-family: var(--font-jbmono), monospace; font-size: 11.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; line-height: 1.4; }

        .sqi-stages { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 20px; margin: 0; padding: 0; list-style: none; counter-reset: none; }
        .sqi-stage { position: relative; display: flex; flex-direction: column; padding: 22px 22px 24px; border: 1px solid rgba(20,17,15,.1); border-radius: 20px; background: #fefaf5; box-shadow: 0 20px 46px -34px rgba(20,17,15,.3); }
        .sqi-stage:not(:last-child)::after { content: ''; position: absolute; top: 22px; right: -14px; width: 24px; height: 24px; background: var(--accent, #ff5a1f); -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 5l7 7-7 7'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 5l7 7-7 7'/%3E%3C/svg%3E") center / contain no-repeat; z-index: 2; }
        .sqi-stage-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .sqi-stage-number { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 999px; background: rgba(241,96,29,.12); color: #ef6c2f; font-family: var(--font-jbmono), monospace; font-size: 12.5px; font-weight: 700; }
        .sqi-stage h3 { margin: 0; font-family: var(--font-sora), system-ui, sans-serif; font-size: 15px; font-weight: 800; letter-spacing: .01em; text-transform: uppercase; }
        .sqi-stage-desc { margin: 0 0 18px; color: #5f574f; font-size: 14px; line-height: 1.5; }
        .sqi-stage-visual { margin-top: auto; }
        .sqi-stage-supporting { margin: 12px 0 0; color: #8b8478; font-size: 12px; line-height: 1.5; }

        .sqi-organiser-panel { border: 1px solid rgba(20,17,15,.1); border-radius: 14px; background: #fff; padding: 14px 16px; }
        .sqi-organiser-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .sqi-organiser-label { font-family: var(--font-jbmono), monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; color: #8b8478; text-transform: uppercase; }
        .sqi-organiser-status { padding: 3px 9px; border-radius: 999px; background: rgba(23,169,104,.14); color: #147a4c; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; }
        .sqi-organiser-team { margin: 0 0 10px; font-size: 15px; font-weight: 800; }
        .sqi-organiser-deadline { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; font-size: 12.5px; color: #5f574f; }
        .sqi-organiser-deadline strong { color: #16130f; }
        .sqi-copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 40px; border: 1.5px solid rgba(20,17,15,.22); border-radius: 8px; background: rgba(20,17,15,.03); color: #16130f; font-family: var(--font-manrope), system-ui, sans-serif; font-size: 12.5px; font-weight: 700; letter-spacing: .02em; cursor: pointer; }
        .sqi-copy-btn:hover { border-color: #16130f; }
        .sqi-copy-btn:focus-visible { outline: 2px solid var(--accent, #ff5a1f); outline-offset: 2px; }
        .sqi-organiser-reassurance { margin: 10px 0 0; color: #8b8478; font-size: 11px; line-height: 1.45; }

        .sqi-family-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .sqi-family-tile { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 6px; border-radius: 12px; background: #fff; border: 1px solid rgba(20,17,15,.08); }
        .sqi-family-photo-wrap { position: relative; display: block; width: 54px; height: 76px; border-radius: 7px; overflow: visible; }
        .sqi-family-photo { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 7px; box-shadow: 0 10px 20px -12px rgba(20,17,15,.5); }
        .sqi-family-photo-wrap--ready .sqi-family-photo { outline: 2px solid rgba(241,96,29,.55); outline-offset: 1px; }
        .sqi-family-photo-wrap--in-progress .sqi-family-photo { opacity: .45; filter: grayscale(.3); }
        .sqi-family-badge { position: absolute; right: -5px; bottom: -5px; display: grid; place-items: center; width: 19px; height: 19px; border-radius: 999px; background: #17a968; border: 2px solid #fff; }
        .sqi-family-status { font-family: var(--font-jbmono), monospace; font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-align: center; color: #5f574f; }
        .sqi-family-status--confirmed { color: #147a4c; }
        .sqi-family-status--ready { color: #b3480f; }
        .sqi-family-status--in-progress { color: #8b8478; font-style: italic; }

        .sqi-stack-photo { display: block; width: 100%; max-width: 220px; height: auto; margin: 4px auto 10px; }

        .sqi-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (prefers-reduced-motion: reduce) {
          .sqi-section * { transition: none !important; }
        }

        @media (max-width: 1024px) {
          .sqi-stages { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }

        @media (min-width: 641px) and (max-width: 1024px) {
          /* Stage 2 sits at the end of row one in this 2-column grid, with
             stage 3 wrapping to its own row below — a horizontal connector
             here would point at empty space, not stage 3, so it's hidden
             for this range only. The numbered circles still make the
             sequence clear without it. Deliberately NOT combined with the
             max-width:1024px rule above — this must not also apply at
             mobile widths, where stages stack in one column and every
             connector (including this one) is wanted. */
          .sqi-stage:nth-child(2)::after { display: none; }
        }

        @media (max-width: 860px) {
          .sqi-top { flex-direction: column; }
          .sqi-progress { max-width: none; }
        }

        @media (max-width: 640px) {
          .sqi-section { padding: 56px 20px !important; }
          .sqi-intro { max-width: none; }
          .sqi-actions { width: 100%; }
          .sqi-cta { width: 100%; }
          .sqi-offer { max-width: none; white-space: normal; text-align: center; justify-content: center; }
          .sqi-stages { grid-template-columns: 1fr; }
          .sqi-stage:not(:last-child)::after { top: auto; right: auto; bottom: -18px; left: 22px; transform: rotate(90deg); }
        }
      ` }} />

      <div className="sqi-top">
        <div className="sqi-intro">
          <p className="emh-eyebrow">{eyebrow}</p>
          <h2 id="sqi-heading">{headline}</h2>
          <p>{supporting}</p>
        </div>

        <div className="sqi-progress" role="group" aria-label="Squad progress example">
          <span className="sqi-progress-percent">{progress.percent}%</span>
          <span className="sqi-progress-label">{progress.label}</span>
          <div
            className="sqi-progress-track"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${progress.ready} of ${progress.target} players ready`}
          >
            <span className="sqi-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="sqi-progress-note">{progress.note}</p>
        </div>
      </div>

      <ol className="sqi-stages">
        {stages.map((stage) => (
          <li key={stage.id} className="sqi-stage">
            <div className="sqi-stage-head">
              <span className="sqi-stage-number" aria-hidden="true">{stage.number}</span>
              <h3>{stage.heading}</h3>
            </div>
            <p className="sqi-stage-desc">{stage.description}</p>
            <div className="sqi-stage-visual">
              {stage.id === 'start' && <OrganiserPanel />}
              {stage.id === 'families' && <FamilyTiles />}
              {stage.id === 'delivered' && <CardStack />}
              {'supporting' in stage && stage.supporting && <p className="sqi-stage-supporting">{stage.supporting}</p>}
            </div>
            {stage.id === 'start' && (
              <div className="sqi-actions">
                {squadInviteEnabled && (
                  <Link className="emh-btn emh-btn-primary sqi-cta" href={ctaHref}>
                    {ctaLabel}
                  </Link>
                )}
                <p className="sqi-offer">{offerPill}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

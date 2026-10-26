import { forwardRef } from 'react';
import Link from 'next/link';

/**
 * The sample season a coach sees after going "through" the card. Plain HTML
 * so it is readable without WebGL, with reduced motion and by screen
 * readers. Only features the product supports: season stats, a family
 * moment with a photo and note, an achievement a coach awards, and a
 * coach-verified recognition, all shown in the player's private profile.
 * The player is the same fictional Riley Hart as the homepage hero.
 */
export const SAMPLE_PLAYER = { name: 'Riley Hart', number: 9, position: 'Striker', team: 'Westbrook Juniors U12' };

type Props = { startHref: string; onBack: () => void; headingId: string };

const SampleSeason = forwardRef<HTMLHeadingElement, Props>(function SampleSeason({ startHref, onBack, headingId }, headingRef) {
  return (
    <div className="emh-portal-season">
      <p className="emh-portal-badge">Sample experience</p>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {SAMPLE_PLAYER.name}&rsquo;s season
      </h3>
      <p className="emh-portal-season-meta">
        No. {SAMPLE_PLAYER.number} · {SAMPLE_PLAYER.position} · {SAMPLE_PLAYER.team} · 2026/27
      </p>

      <dl className="emh-portal-stats">
        <div><dt>Appearances</dt><dd>24</dd></div>
        <div><dt>Goals</dt><dd>11</dd></div>
        <div><dt>Assists</dt><dd>6</dd></div>
      </dl>

      <ul className="emh-portal-moments">
        <li>
          <span className="emh-portal-kind">Highlight</span>
          <b>Late winner in the cup quarter-final</b>
          <small>Family memory · photo and note added by a parent</small>
        </li>
        <li>
          <span className="emh-portal-kind">Achievement</span>
          <b><span aria-hidden="true">⭐ </span>Player of the Match</b>
          <small>Awarded by the coach · Saturday</small>
        </li>
        <li>
          <span className="emh-portal-kind">Coach recognition</span>
          <b>&ldquo;Brilliant work rate, pressing from the front all game.&rdquo;</b>
          <small>Verified by the coach</small>
        </li>
      </ul>

      <p className="emh-portal-note">
        Shown here for illustration. On the real card, a tap with a phone opens the player&rsquo;s private profile with these
        moments. There is no 3D world on the card itself.
      </p>

      <div className="emh-portal-season-actions">
        <button type="button" className="emh-btn emh-btn-secondary emh-portal-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to card
        </button>
        <Link className="emh-btn emh-btn-primary" href={startHref} data-track="clubs_portal_start">
          Start a Squad Invite
        </Link>
      </div>
    </div>
  );
});

export default SampleSeason;

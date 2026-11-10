import { forwardRef } from 'react';

/**
 * What a coach sees after going "through" the card: the real public app
 * demo (/os/demo/embed, fictional sample data only) in a phone-sized frame.
 * Framing keeps the app's own URL handling, page-level styles and fixed
 * overlays inside the frame, so none of it can affect the clubs page.
 *
 * Back to card sits above the app so keyboard users reach it before the
 * app's own controls; Escape inside the app also closes it (OsApp posts
 * 'emblem-demo:escape' to this page).
 */
export const SAMPLE_PLAYER = { name: 'Riley Hart', number: 9 };
export const DEMO_EMBED_SRC = '/os/demo/embed';

type Props = { onBack: () => void; headingId: string };

const SampleAppPanel = forwardRef<HTMLHeadingElement, Props>(function SampleAppPanel({ onBack, headingId }, headingRef) {
  return (
    <div className="emh-portal-app">
      <div className="emh-portal-app-head">
        <div>
          <p className="emh-portal-badge">Sample experience</p>
          <h3 id={headingId} ref={headingRef} tabIndex={-1} className="emh-portal-app-title">
            {SAMPLE_PLAYER.name}&rsquo;s player profile
          </h3>
        </div>
        <button type="button" className="emh-btn emh-btn-secondary emh-portal-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to card
        </button>
      </div>
      <p className="emh-portal-app-note">Tap your physical card with a phone to open your private player profile.</p>
      <iframe
        className="emh-portal-app-frame"
        src={DEMO_EMBED_SRC}
        title="Emblem app demo with a fictional sample player"
        loading="eager"
      />
    </div>
  );
});

export default SampleAppPanel;

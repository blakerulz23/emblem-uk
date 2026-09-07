'use client';

/**
 * The one genuinely-interactive piece of the Squad Invite journey section
 * — everything else in that section is static markup/CSS. Kept as its own
 * small client island so the parent section stays a plain server
 * component (no "use client" needed there just for this one button).
 *
 * This is a homepage marketing demonstration, not a real organiser
 * screen: it never has a real invite token to copy. It copies a fixed,
 * obviously-synthetic placeholder URL and announces success through a
 * visually-hidden aria-live region — never a real production link.
 */

import { useState } from 'react';

const PLACEHOLDER_LINK = 'https://emblem-uk.example/squad-invite/demo-preview-link';

export default function SquadInviteCopyLinkButton() {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PLACEHOLDER_LINK);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <>
      <button type="button" className="sqi-copy-btn" onClick={handleCopy}>
        COPY INVITE LINK
      </button>
      <span className="sqi-sr-only" role="status" aria-live="polite">
        {status === 'copied' && 'Demo link copied.'}
        {status === 'failed' && 'Could not copy the demo link.'}
      </span>
    </>
  );
}

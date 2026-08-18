'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InvitationAccess() {
  const router = useRouter();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token') ?? '';
    window.history.replaceState(null, '', '/squad-invite/access');
    void fetch('/api/squad-invite-links/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    }).then((response) => {
      if (!response.ok) throw new Error('unavailable');
      router.replace('/squad-invite/join');
    }).catch(() => setUnavailable(true));
  }, [router]);

  return <main><h1>{unavailable ? 'Squad Invite unavailable' : 'Opening your Squad Invite…'}</h1></main>;
}

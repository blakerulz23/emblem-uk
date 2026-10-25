'use client';

import SignIn from '@/app/os/overlays/SignIn';

/** Same one-time-code sign-in as staff (StaffLoginForm), landing back on the dashboard. */
export default function PartnerSignIn() {
  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#0f0c0a' }}>
      <SignIn onSuccess={() => { window.location.href = '/partners'; }} />
    </main>
  );
}

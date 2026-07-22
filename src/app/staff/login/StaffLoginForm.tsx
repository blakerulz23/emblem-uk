'use client';

import SignIn from '@/app/os/overlays/SignIn';

export default function StaffLoginForm({ next }: { next: string }) {
  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#0f0c0a' }}>
      <SignIn onSuccess={() => { window.location.href = next; }} />
    </main>
  );
}
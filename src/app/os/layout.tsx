import type { Metadata, Viewport } from 'next';
import './os.css';

export const metadata: Metadata = {
  title: 'Emblem OS',
  description: 'The mobile experience an Emblem card unlocks.',
};

/**
 * viewport-fit=cover — without it, iOS never extends layout under the
 * notch/Dynamic Island/home-indicator areas, and every env(safe-area-
 * inset-*) call already in this codebase (the floating dock's bottom
 * offset, #os-scroll's bottom padding, .emblem-os's top padding) silently
 * resolves to 0px, always — the fallback value, not a real measurement.
 * That's mostly invisible in a plain Safari tab (the browser already keeps
 * fixed content clear of those areas on its own there), but it matters for
 * real on a home-indicator iPhone in standalone/PWA mode, where there's no
 * browser chrome doing that automatically. Scoped to this nested layout
 * (not src/app/layout.tsx) so marketing/staff/builder pages, which never
 * use env(safe-area-inset-*) at all, are completely unaffected.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

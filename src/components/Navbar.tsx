'use client';

import Link from 'next/link';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Home' },
  { href: '/#sports', label: 'Sports' },
  { href: '/#team-orders', label: 'Team orders' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        background: 'rgba(255,255,255,0.86)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderColor: 'var(--line)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-24 items-center justify-between">
          <Link href="/" className="flex items-center" onClick={() => setMobileOpen(false)}>
            <img src="/brand-lockup.png" alt="Emblem" style={{ height: 54, width: 'auto', display: 'block' }} />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium transition-colors hover:opacity-100"
                style={{ color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope), system-ui' }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/builder?product=cards"
              className="inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-bold transition-transform active:scale-[0.98]"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                boxShadow: '0 6px 22px var(--accent-glow)',
                fontFamily: 'var(--font-manrope), system-ui',
                letterSpacing: 0,
              }}
            >
              Create a card
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            style={{ color: 'var(--ink)', padding: 8, marginRight: -8 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden border-t"
          style={{
            borderColor: 'var(--line)',
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <div className="px-4 py-3 flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold transition-colors"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-manrope), system-ui' }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/builder?product=cards"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-base font-bold"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                boxShadow: '0 6px 22px var(--accent-glow)',
                fontFamily: 'var(--font-manrope), system-ui',
                letterSpacing: 0,
              }}
            >
              Create a card
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';

const links = [
  { href: '/#collection', label: 'The cards' },
  { href: '/#journey', label: 'How it works' },
  { href: '/#squad', label: 'Teams' },
  { href: '/#pricing', label: 'Pricing' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b emh-site-nav"
      style={{
        background: 'rgba(8,9,10,0.86)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <div className="mx-auto max-w-[1220px] px-6">
        <div className="flex h-[92px] items-center justify-between gap-6">
          <Link href="/" className="flex items-center" onClick={() => setMobileOpen(false)}>
            <img src="/embm.png" alt="Emblem" className="emh-nav-logo" />
          </Link>

          <div className="hidden min-[860px]:flex items-center gap-[30px]">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="emh-nav-link"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/builder?mode=single"
              className="emh-nav-cta"
            >
              Build your card
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            className="min-[860px]:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            style={{ color: '#fff', padding: 8, marginRight: -8 }}
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
          className="min-[860px]:hidden border-t"
          style={{
            borderColor: 'rgba(255,255,255,0.07)',
            background: 'rgba(8,9,10,0.96)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div className="px-6 py-4 flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold transition-colors"
                style={{ color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-rajdhani), system-ui', textTransform: 'uppercase', letterSpacing: '0.04em' }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/builder?mode=single"
              onClick={() => setMobileOpen(false)}
              className="emh-nav-cta mt-2 inline-flex items-center justify-center"
            >
              Build your card
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

import Link from 'next/link';

export default function Footer() {
  return (
    <footer
      className="border-t mt-24"
      style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.65)' }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center mb-4">
              <img src="/brand-lockup.png" alt="Emblem" style={{ height: 60, width: 'auto', display: 'block' }} />
            </Link>
            <p
              className="max-w-md leading-relaxed"
              style={{ color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope), system-ui', fontSize: 14.5 }}
            >
              The home of the grassroots player journey for UK families, clubs and teams. Play the season. Remember the journey. Belong forever.
            </p>

            <div className="flex gap-2.5 mt-6">
              <div
                className="rounded-xl px-3 py-2 text-center"
                style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
              >
                <div style={{ fontFamily: 'var(--font-jbmono), monospace', fontWeight: 600, fontSize: 12, color: 'var(--ink)', letterSpacing: '0.04em' }}>
                  UK
                </div>
                <div style={{ color: 'var(--ink-faint)', fontSize: 10.5, fontFamily: 'var(--font-manrope), system-ui', marginTop: 1 }}>
                  Football first
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3
              style={{
                fontFamily: 'var(--font-jbmono), monospace',
                fontWeight: 600,
                fontSize: 11.5,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                marginBottom: 14,
              }}
            >
              Product
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: '/builder?mode=single', label: 'Create a card' },
                { href: '/#sports', label: 'Sports' },
                { href: '/#team-orders', label: 'Team orders' },
                { href: '/privacy', label: 'Privacy' },
                { href: '/terms', label: 'Terms' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:underline"
                    style={{ color: 'var(--ink-soft)', fontFamily: 'var(--font-manrope), system-ui', fontSize: 14 }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-12 pt-7 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <p style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, letterSpacing: '0.04em' }}>
            &copy; {new Date().getFullYear()} EMBLEM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

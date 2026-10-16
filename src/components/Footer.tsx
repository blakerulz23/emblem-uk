import Link from 'next/link';
import CountrySwitcher from './CountrySwitcher';

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/#cards', label: 'The cards' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/os/demo', label: 'Digital profile' },
      { href: '/#pricing', label: 'Pricing' },
      { href: '/football-gifts-for-kids', label: 'Football gifts for kids' },
    ],
  },
  {
    title: 'For teams',
    links: [
      { href: '/how-it-works#squad', label: 'Clubs & coaches' },
      { href: '/builder?mode=squad', label: 'Team packs' },
      { href: '/how-it-works#squad', label: 'Leagues' },
    ],
  },
  {
    title: 'Emblem',
    links: [
      { href: '/#top', label: 'Play. Remember. Belong.' },
      { href: '/faq', label: 'FAQ' },
      { href: '/trust-and-safeguarding', label: 'Trust & safeguarding' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="emh-footer">
      <div className="emh-footer-main">
        <div className="emh-footer-brand">
          <Link href="/" aria-label="Emblem home">
            <img src="/emblem-footer-logo.png" alt="Emblem" loading="lazy" decoding="async" />
          </Link>
          <p>Premium collectible player cards and living digital profiles for UK grassroots football.</p>
        </div>

        {columns.map((column) => (
          <div key={column.title} className="emh-footer-col">
            <h3>{column.title}</h3>
            <ul>
              {column.links.map((link) => (
                <li key={`${column.title}-${link.href}-${link.label}`}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="emh-footer-bottom">
        <span>© {new Date().getFullYear()} Emblem. Made for grassroots football in the UK.</span>
        <CountrySwitcher />
        <strong>Play. <b>Remember.</b> Belong.</strong>
      </div>
    </footer>
  );
}

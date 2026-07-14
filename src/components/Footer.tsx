import Link from 'next/link';

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/#collection', label: 'The cards' },
      { href: '/#journey', label: 'How it works' },
      { href: '/#journey', label: 'Digital profile' },
      { href: '/#pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'For teams',
    links: [
      { href: '/#squad', label: 'Clubs & coaches' },
      { href: '/builder?mode=squad', label: 'Team packs' },
      { href: '/#squad', label: 'Leagues' },
    ],
  },
  {
    title: 'Emblem',
    links: [
      { href: '/#top', label: 'Play. Remember. Belong.' },
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
        <strong>Play. <b>Remember.</b> Belong.</strong>
      </div>
    </footer>
  );
}

import type { Metadata } from 'next';
import { Sora, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ConditionalChrome from '@/components/ConditionalChrome';
import { isDisposableSquadInviteMvpPreview } from '@/lib/squad-invite-preview-safety';

// Marketing typography (emblem.cards). Scoped to the marketing shell via
// .marketing-shell in globals.css — Builder, Player OS and Staff tools keep
// their own existing --font-sora/--font-manrope/--font-jbmono bindings.
const marketingSora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-marketing-sora',
  display: 'swap',
});

const marketingManrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-marketing-manrope',
  display: 'swap',
});

const marketingJbMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-marketing-jbmono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Emblem UK | Grassroots player cards',
  description:
    'Turn a child football photo into a premium printed player card with an interactive digital profile for stats, photos, highlights and memories.',
  manifest: '/manifest.json',
  themeColor: '#E97435',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Emblem OS',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${marketingSora.variable} ${marketingManrope.variable} ${marketingJbMono.variable}`}>
      <body className="font-body text-[var(--ink)] antialiased">
        <ConditionalChrome disposableSquadInvitePreview={isDisposableSquadInviteMvpPreview()}>{children}</ConditionalChrome>
      </body>
    </html>
  );
}

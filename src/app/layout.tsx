import type { Metadata } from 'next';
import { Sora, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ConditionalChrome from '@/components/ConditionalChrome';
import { isDisposableSquadInviteMvpPreview } from '@/lib/squad-invite-preview-safety';
import { googleSiteVerification, OG_IMAGE, SITE_URL } from '@/lib/marketing/site';
import AnalyticsConsent from '@/components/marketing/AnalyticsConsent';
import VercelWebAnalytics from '@/components/marketing/VercelWebAnalytics';

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

// Site-wide defaults. Canonical URLs are set per page (never here: a root
// canonical would point every page without its own metadata at the homepage).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Emblem UK | Personalised football cards with a digital player profile',
  description:
    'Personalised football cards made from your child’s photo, printed in the UK with a built-in NFC chip that opens a private, guardian-controlled player profile.',
  openGraph: {
    type: 'website',
    siteName: 'Emblem',
    locale: 'en_GB',
    images: [{ url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: 'A personalised Emblem football card and its digital player profile' }],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  manifest: '/manifest.json',
  themeColor: '#E97435',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Emblem OS',
  },
  // Google Search Console (URL-prefix property, HTML-tag method): renders
  // <meta name="google-site-verification"> on every page via the Metadata API.
  ...(googleSiteVerification() ? { verification: { google: googleSiteVerification() } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${marketingSora.variable} ${marketingManrope.variable} ${marketingJbMono.variable}`}>
      <body className="font-body text-[var(--ink)] antialiased">
        <ConditionalChrome disposableSquadInvitePreview={isDisposableSquadInviteMvpPreview()}>{children}</ConditionalChrome>
        <AnalyticsConsent />
        <VercelWebAnalytics />
      </body>
    </html>
  );
}

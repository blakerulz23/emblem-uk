import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import ConditionalChrome from '@/components/ConditionalChrome';
import { isDisposableSquadInviteMvpPreview } from '@/lib/squad-invite-preview-safety';
import { googleSiteVerification, OG_IMAGE, SITE_URL } from '@/lib/marketing/site';
import AnalyticsConsent from '@/components/marketing/AnalyticsConsent';
import VercelWebAnalytics from '@/components/marketing/VercelWebAnalytics';

// Site typography: Manrope everywhere (see --font-sora/--font-manrope/
// --font-jbmono in globals.css, which all point at it). Card artwork keeps
// its own fonts (.uk-real-card in globals.css).
const marketingManrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-marketing-manrope',
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
    <html lang="en-GB" className={marketingManrope.variable}>
      <body className="font-body text-[var(--ink)] antialiased">
        <ConditionalChrome disposableSquadInvitePreview={isDisposableSquadInviteMvpPreview()}>{children}</ConditionalChrome>
        <AnalyticsConsent />
        <VercelWebAnalytics />
      </body>
    </html>
  );
}

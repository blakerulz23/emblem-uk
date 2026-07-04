import type { Metadata } from 'next';
import './globals.css';
import ConditionalChrome from '@/components/ConditionalChrome';

export const metadata: Metadata = {
  title: 'Emblem UK | Grassroots player cards',
  description:
    'Turn a child football photo into a premium printed player card with an interactive digital profile for stats, photos, highlights and memories.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-body text-[var(--ink)] antialiased">
        <ConditionalChrome>{children}</ConditionalChrome>
      </body>
    </html>
  );
}

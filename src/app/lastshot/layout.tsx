import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Last Shot Cards — Make your card like the players',
  description: 'Official custom trading cards, posters, stickers and keychains for the Last Shot movie. Upload one photo and become a Last Shot player. In theaters April 8, 2026.',
  openGraph: {
    title: 'Last Shot Cards',
    description: 'Make your card like the players in Last Shot. In theaters April 8, 2026.',
    type: 'website',
  },
};

export default function LastShotLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

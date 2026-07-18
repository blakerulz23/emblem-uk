import type { Metadata } from 'next';
import './os.css';

export const metadata: Metadata = {
  title: 'Emblem OS',
  description: 'The mobile experience an Emblem card unlocks.',
};

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

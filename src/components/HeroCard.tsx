'use client';

import CardCanvas from '@/components/builder/CardCanvas';
import { CardData } from '@/lib/types';
import { TEMPLATES } from '@/lib/templates';

const heroCard: CardData = {
  sport: 'basketball',
  template: TEMPLATES.find(t => t.id === 'basketball-futuristic') ?? null,
  playerName: 'Jaylen Ross',
  teamName: 'Thunder',
  jerseyNumber: '23',
  position: 'Point Guard',
  accentColor: '#DC2626',
  secondaryColor: '#1E3A5F',
  playerPhoto: '/samples/player-jaylen.png',
  teamLogo: '/samples/elite-hoops-logo.png',
  photoOffsetX: 0,
  photoOffsetY: 0,
  photoScale: 1,
  showStats: true,
  stats: { ppg: '28.5', rpg: '6.2', apg: '8.1', spg: '2.3', bpg: '0.5', ftpct: '89' },
  backText: '',
  backPhoto: null,
  backPhotoOffsetX: 0,
  backPhotoOffsetY: 0,
  backPhotoScale: 1,
  height: `5'10"`,
  age: '16',
  classYear: '2027',
  hometown: 'Atlanta, GA',
};

export default function HeroCard() {
  return (
    <div className="relative flex items-center justify-center py-8">
      {/* Outer red glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-600/25 via-red-900/15 to-transparent rounded-3xl blur-3xl scale-125" />
      {/* Gold shimmer */}
      <div className="absolute inset-0 bg-gradient-to-tl from-yellow-500/10 via-transparent to-transparent rounded-3xl blur-2xl" />
      <div className="relative group rotate-2 hover:rotate-0 transition-transform duration-700 ease-out drop-shadow-2xl">
        <CardCanvas card={heroCard} side="front" width={250} />
      </div>
    </div>
  );
}

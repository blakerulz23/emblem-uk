'use client';

import { useBuilder } from '@/context/BuilderContext';
import { Sport, SPORT_INFO } from '@/lib/types';

const sports: Sport[] = ['baseball', 'basketball', 'soccer', 'football'];

export default function ChooseSport() {
  const { card, setSport, nextStep } = useBuilder();

  const handleSelect = (sport: Sport) => {
    setSport(sport);
    nextStep();
  };

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-white mb-2">Choose Your Sport</h2>
        <p className="text-gray-400">Select the sport for your custom trading card</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
        {sports.map((sport) => {
          const info = SPORT_INFO[sport];
          const isSelected = card.sport === sport;
          return (
            <button
              key={sport}
              onClick={() => handleSelect(sport)}
              className={`group relative p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-105 overflow-hidden ${
                isSelected
                  ? 'border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20'
                  : 'border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-800/60'
              }`}
            >
              {/* Sport-color glow on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `radial-gradient(circle at center, ${info.color}18, transparent 65%)` }}
              />

              <div className="relative text-5xl mb-3 group-hover:scale-110 transition-transform duration-200">
                {info.icon}
              </div>
              <div className="relative text-base font-bold text-white">{info.label}</div>

              {isSelected && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

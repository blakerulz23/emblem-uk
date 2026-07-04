'use client';

import { useState } from 'react';
import { useBuilder } from '@/context/BuilderContext';
import CardCanvas from './CardCanvas';

export default function LivePreview() {
  const { card, prevStep, nextStep } = useBuilder();
  const [side, setSide] = useState<'front' | 'back'>('front');

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Preview Your Card</h2>
        <p className="text-gray-400">Check both sides of your custom card before ordering</p>
      </div>

      <div className="flex flex-col items-center">
        {/* Card Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSide('front')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              side === 'front' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Front
          </button>
          <button
            onClick={() => setSide('back')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              side === 'back' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Back
          </button>
        </div>

        {/* Large Card Preview */}
        <div className="relative">
          <div className="absolute -inset-8 bg-gradient-to-r from-red-500/20 via-purple-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
          <div className="relative">
            <CardCanvas card={card} side={side} width={320} />
          </div>
        </div>

        {/* Card Details */}
        <div className="mt-8 bg-gray-900/50 rounded-xl p-4 border border-gray-800 max-w-md w-full">
          <h3 className="text-sm font-semibold text-white mb-3">Card Details</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-400">Player:</span>
            <span className="text-white">{card.playerName || '—'}</span>
            <span className="text-gray-400">Team:</span>
            <span className="text-white">{card.teamName || '—'}</span>
            <span className="text-gray-400">Number:</span>
            <span className="text-white">{card.jerseyNumber ? `#${card.jerseyNumber}` : '—'}</span>
            <span className="text-gray-400">Position:</span>
            <span className="text-white">{card.position || '—'}</span>
            <span className="text-gray-400">Template:</span>
            <span className="text-white">{card.template?.name || '—'}</span>
            <span className="text-gray-400">Card Size:</span>
            <span className="text-white">2.5&quot; x 3.5&quot; (Standard)</span>
            <span className="text-gray-400">Features:</span>
            <span className="text-white">NFC-Enabled, Premium Stock</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between w-full max-w-md mt-6">
          <button onClick={prevStep} className="text-gray-400 hover:text-white transition-colors text-sm">
            &larr; Back to Customize
          </button>
          <button
            onClick={nextStep}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Order Now &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

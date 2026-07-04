'use client';

import { useBuilder } from '@/context/BuilderContext';
import { getTemplatesForSport } from '@/lib/templates';
import { SPORT_INFO } from '@/lib/types';
import CardCanvas from './CardCanvas';

const STYLE_CONFIG: Record<string, { selected: string; hover: string; badge: string; glowColor: string; badgeLabel?: string }> = {
  futuristic: {
    selected: 'border-red-500/80 bg-red-950/20 shadow-red-500/30',
    hover: 'hover:border-red-500/40 hover:shadow-red-500/20',
    badge: 'bg-red-900/40 text-red-400 border-red-800/50',
    glowColor: '#DC2626',
  },
  'galaxy-holo': {
    selected: 'border-purple-400/80 bg-purple-950/20 shadow-purple-400/30',
    hover: 'hover:border-purple-400/40 hover:shadow-purple-400/20',
    badge: 'bg-purple-900/40 text-purple-300 border-purple-800/50',
    glowColor: '#A855F7',
    badgeLabel: 'HOLO',
  },
  holo: {
    selected: 'border-purple-400/80 bg-purple-950/20 shadow-purple-400/30',
    hover: 'hover:border-purple-400/40 hover:shadow-purple-400/20',
    badge: 'bg-purple-900/40 text-purple-300 border-purple-800/50',
    glowColor: '#A855F7',
  },
  chrome: {
    selected: 'border-blue-400/80 bg-blue-950/20 shadow-blue-400/30',
    hover: 'hover:border-blue-400/40 hover:shadow-blue-400/20',
    badge: 'bg-blue-900/40 text-blue-300 border-blue-800/50',
    glowColor: '#60A5FA',
  },
  'chrome-legacy': {
    selected: 'border-zinc-300/80 bg-zinc-900/30 shadow-zinc-300/20',
    hover: 'hover:border-zinc-400/40 hover:shadow-zinc-400/20',
    badge: 'bg-zinc-800/50 text-zinc-300 border-zinc-600/50',
    glowColor: '#D4D4D8',
    badgeLabel: 'LEGACY',
  },
};

const DEFAULT_STYLE = {
  selected: 'border-gray-400/80 bg-gray-800/20 shadow-gray-400/30',
  hover: 'hover:border-gray-400/40 hover:shadow-gray-400/20',
  badge: 'bg-gray-800/40 text-gray-300 border-gray-700/50',
  glowColor: '#9CA3AF',
};

export default function PickTemplate() {
  const { card, setTemplate, nextStep, prevStep } = useBuilder();

  if (!card.sport) return null;

  const templates = getTemplatesForSport(card.sport).filter(
    (t) => t.style === 'futuristic' || t.style === 'galaxy-holo' || t.style === 'chrome-legacy'
  );
  const sportInfo = SPORT_INFO[card.sport];

  const handleSelect = (template: typeof templates[0]) => {
    setTemplate(template);
    nextStep();
  };

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-white mb-2">Pick a Template</h2>
        <p className="text-gray-400">
          Choose a design style for your {sportInfo.label} card
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {templates.map((template) => {
          const isSelected = card.template?.id === template.id;
          const previewCard = { ...card, template, accentColor: sportInfo.color };
          const style = STYLE_CONFIG[template.style] ?? DEFAULT_STYLE;

          return (
            <button
              key={template.id}
              onClick={() => handleSelect(template)}
              className={`group relative p-4 pb-5 rounded-2xl border-2 transition-all duration-300 hover:scale-[1.03] shadow-xl ${
                isSelected
                  ? `${style.selected} shadow-xl`
                  : `border-gray-800 bg-gray-900/50 hover:bg-gray-900/80 shadow-black/30 ${style.hover}`
              }`}
            >
              {/* Selected checkmark */}
              {isSelected && (
                <div className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-600/40 z-10">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* Card preview */}
              <div className="relative flex justify-center mb-5">
                {isSelected && (
                  <div
                    className="absolute inset-0 rounded-xl blur-2xl opacity-40 scale-110"
                    style={{ background: `radial-gradient(circle, ${style.glowColor}, transparent 70%)` }}
                  />
                )}
                <div className={`relative transition-transform duration-300 ${!isSelected ? 'group-hover:scale-[1.03]' : ''}`}>
                  <CardCanvas card={previewCard} side="front" width={210} />
                </div>
              </div>

              <div className="text-left">
                <h3 className="text-base font-bold text-white mb-1">{template.name}</h3>
                <p className="text-gray-400 text-xs mb-3 leading-relaxed">{template.description}</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style.badge}`}>
                  {style.badgeLabel ?? template.style}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-center mt-10">
        <button onClick={prevStep} className="text-gray-400 hover:text-white transition-colors text-sm">
          &larr; Back to Sports
        </button>
      </div>
    </div>
  );
}

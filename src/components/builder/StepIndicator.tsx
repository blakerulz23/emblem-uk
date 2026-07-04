'use client';

import { useBuilder } from '@/context/BuilderContext';

const STEPS = [
  { num: 1, label: 'Sport' },
  { num: 2, label: 'Template' },
  { num: 3, label: 'Customize' },
  { num: 4, label: 'Preview' },
  { num: 5, label: 'Order' },
];

export default function StepIndicator() {
  const { step, setStep, card } = useBuilder();

  const canGoTo = (targetStep: number) => {
    if (targetStep === 1) return true;
    if (targetStep === 2) return !!card.sport;
    if (targetStep === 3) return !!card.template;
    if (targetStep >= 4) return !!card.template && !!card.playerName;
    return false;
  };

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <button
            onClick={() => canGoTo(s.num) && setStep(s.num)}
            disabled={!canGoTo(s.num)}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
              step === s.num
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                : step > s.num
                  ? 'bg-green-600/20 text-green-400 cursor-pointer hover:bg-green-600/30'
                  : canGoTo(s.num)
                    ? 'bg-gray-800 text-gray-400 cursor-pointer hover:bg-gray-700'
                    : 'bg-gray-900 text-gray-600 cursor-not-allowed'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              step > s.num ? 'bg-green-600 text-white' : ''
            }`}>
              {step > s.num ? '✓' : s.num}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <div className={`w-4 sm:w-8 h-0.5 mx-1 ${step > s.num ? 'bg-green-600' : 'bg-gray-800'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

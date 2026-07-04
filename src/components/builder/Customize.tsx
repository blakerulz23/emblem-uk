'use client';

import { useBuilder } from '@/context/BuilderContext';
import { SPORT_POSITIONS, SPORT_STATS } from '@/lib/types';
import CardCanvas from './CardCanvas';
import { useCallback, useState } from 'react';

const ACCENT_COLORS = [
  '#DC2626', '#EA580C', '#D97706', '#16A34A', '#0891B2',
  '#2563EB', '#7C3AED', '#DB2777', '#000000', '#FFFFFF',
];

export default function Customize() {
  const { card, updateCard, nextStep, prevStep } = useBuilder();

  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const sport = card.sport!;
  const positions = SPORT_POSITIONS[sport];

  const handlePhotoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateCard({ playerPhoto: ev.target?.result as string });
      };
      reader.readAsDataURL(file);
    },
    [updateCard]
  );

  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateCard({ teamLogo: ev.target?.result as string });
      };
      reader.readAsDataURL(file);
    },
    [updateCard]
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">

      {/* Live Preview — top on mobile, sticky right on desktop */}
      <div className="order-first lg:order-last lg:w-80 flex flex-col items-center lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Live Preview</p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPreviewSide('front')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              previewSide === 'front'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Front
          </button>
          <button
            onClick={() => setPreviewSide('back')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              previewSide === 'back'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Back
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-red-600/15 via-transparent to-transparent rounded-3xl blur-2xl scale-110 pointer-events-none" />
          <CardCanvas card={card} side={previewSide} width={260} />
        </div>
        <p className="text-xs text-gray-600 mt-3 text-center">Updates in real time</p>
      </div>

      {/* Form — bottom on mobile, left on desktop */}
      <div className="order-last lg:order-first flex-1 space-y-5">
        <div className="text-center lg:text-left mb-2">
          <h2 className="text-3xl font-bold text-white mb-2">Customize Your Card</h2>
          <p className="text-gray-400">Fill in the details and watch your card come to life</p>
        </div>

        {/* Player Photo Upload */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
          <label className="block text-sm font-semibold text-white mb-3">Player Photo</label>
          <label className="block cursor-pointer group">
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="sr-only" />
            {card.playerPhoto ? (
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors">
                <img src={card.playerPhoto} className="w-12 h-16 object-cover rounded-lg flex-shrink-0" alt="Player" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Photo uploaded</p>
                  <p className="text-gray-500 text-xs">Click to change</p>
                </div>
                <div className="w-8 h-8 bg-gray-700 group-hover:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-700 group-hover:border-red-500/50 rounded-xl p-6 text-center transition-all group-hover:bg-red-500/5">
                <div className="w-12 h-12 bg-gray-800 group-hover:bg-gray-750 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-white text-sm font-medium mb-1">Upload Player Photo</p>
                <p className="text-gray-500 text-xs">JPG or PNG · Any size</p>
              </div>
            )}
          </label>

          {card.playerPhoto && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs text-gray-400 font-medium">Zoom</label>
                  <span className="text-xs text-gray-600">{card.photoScale.toFixed(1)}×</span>
                </div>
                <input
                  type="range" min="0.5" max="3" step="0.1"
                  value={card.photoScale}
                  onChange={(e) => updateCard({ photoScale: parseFloat(e.target.value) })}
                  className="w-full accent-red-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Horizontal</label>
                  <input
                    type="range" min="-100" max="100"
                    value={card.photoOffsetX}
                    onChange={(e) => updateCard({ photoOffsetX: parseInt(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Vertical</label>
                  <input
                    type="range" min="-100" max="100"
                    value={card.photoOffsetY}
                    onChange={(e) => updateCard({ photoOffsetY: parseInt(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                </div>
              </div>
              <button
                onClick={() => updateCard({ playerPhoto: null, photoOffsetX: 0, photoOffsetY: 0, photoScale: 1 })}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Remove photo
              </button>
            </div>
          )}
        </div>

        {/* Player Info */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 space-y-3">
          <h3 className="text-sm font-semibold text-white">Player Info</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" placeholder="Player Name"
              value={card.playerName}
              onChange={(e) => updateCard({ playerName: e.target.value })}
              className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <input
              type="text" placeholder="Team Name"
              value={card.teamName}
              onChange={(e) => updateCard({ teamName: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <input
              type="text" placeholder="Jersey #"
              value={card.jerseyNumber}
              onChange={(e) => updateCard({ jerseyNumber: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <select
              value={card.position}
              onChange={(e) => updateCard({ position: e.target.value })}
              className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
            >
              <option value="">Select Position</option>
              {positions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Accent Color */}
        {card.template && card.template.style !== 'holo' && card.template.style !== 'futuristic' && (
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Accent Color</h3>
              <p className="text-xs text-gray-500 mt-0.5">Controls neon glow and accent elements</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateCard({ accentColor: color })}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                    card.accentColor === color ? 'border-white scale-110 shadow-lg' : 'border-gray-600 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Team Logo */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
          <label className="block text-sm font-semibold text-white mb-3">Team Logo <span className="text-gray-500 font-normal text-xs">(optional)</span></label>
          <label className="block cursor-pointer group">
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="sr-only" />
            {card.teamLogo ? (
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors">
                <img src={card.teamLogo} className="w-10 h-10 object-contain rounded-lg flex-shrink-0" alt="Team Logo" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Logo uploaded</p>
                  <p className="text-gray-500 text-xs">Click to change</p>
                </div>
                <div className="w-8 h-8 bg-gray-700 group-hover:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-700 group-hover:border-gray-500 rounded-xl p-5 text-center transition-all group-hover:bg-gray-800/30">
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-2.5 transition-colors">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-white text-sm font-medium mb-0.5">Upload Team Logo</p>
                <p className="text-gray-500 text-xs">PNG with transparency works best</p>
              </div>
            )}
          </label>
          {card.teamLogo && (
            <button
              onClick={() => updateCard({ teamLogo: null })}
              className="mt-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Remove logo
            </button>
          )}
        </div>

        {/* Back of Card */}
        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Back of Card</h3>
            <button
              onClick={() => setPreviewSide('back')}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Preview back →
            </button>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative flex-shrink-0">
              <input
                type="checkbox"
                checked={card.showStats}
                onChange={(e) => updateCard({ showStats: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-red-600 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-white">Show Season Stats</span>
          </label>

          {card.showStats && card.sport && (
            <div>
              {card.template?.style === 'futuristic' && (
                <p className="text-xs text-gray-500 mb-2">First 3 stats appear on card</p>
              )}
            <div className="grid grid-cols-3 gap-2">
              {SPORT_STATS[card.sport].map((stat) => (
                <div key={stat.key}>
                  <label className="block text-xs text-gray-400 mb-1">{stat.label}</label>
                  <input
                    type="text" placeholder={stat.placeholder}
                    value={(card.stats || {})[stat.key] || ''}
                    onChange={(e) => updateCard({ stats: { ...(card.stats || {}), [stat.key]: e.target.value } })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              ))}
            </div>
            </div>
          )}

          {card.template?.style === 'futuristic' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Physical Stats</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Height</label>
                  <input type="text" placeholder="5'10&quot;"
                    value={card.height}
                    onChange={(e) => updateCard({ height: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Age</label>
                  <input type="text" placeholder="15"
                    value={card.age}
                    onChange={(e) => updateCard({ age: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Class Year</label>
                  <input type="text" placeholder="2027"
                    value={card.classYear}
                    onChange={(e) => updateCard({ classYear: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Hometown</label>
                  <input type="text" placeholder="Atlanta, GA"
                    value={card.hometown}
                    onChange={(e) => updateCard({ hometown: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Bio / Message</label>
            <textarea
              placeholder="Add a short bio, motto, or shoutout..."
              value={card.backText}
              onChange={(e) => updateCard({ backText: e.target.value })}
              rows={3} maxLength={200}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none transition-colors"
            />
            <p className="text-xs text-gray-600 mt-1">{card.backText.length}/200</p>
          </div>

          {card.template?.style !== 'futuristic' && <div>
            <label className="block text-xs text-gray-400 mb-2">Back Photo <span className="text-gray-600">(optional)</span></label>
            <label className="block cursor-pointer group">
              <input
                type="file" accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => updateCard({ backPhoto: ev.target?.result as string });
                  reader.readAsDataURL(file);
                }}
                className="sr-only"
              />
              {card.backPhoto ? (
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors">
                  <img src={card.backPhoto} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" alt="Back" />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">Back photo set</p>
                    <p className="text-gray-500 text-xs">Click to change</p>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-gray-700 group-hover:border-gray-600 rounded-xl p-4 text-center transition-all">
                  <p className="text-gray-500 text-xs">Click to upload a back photo</p>
                </div>
              )}
            </label>
            {card.backPhoto && (
              <div className="mt-3 space-y-2">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs text-gray-400">Zoom</label>
                    <span className="text-xs text-gray-600">{card.backPhotoScale.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range" min="0.5" max="3" step="0.1"
                    value={card.backPhotoScale}
                    onChange={(e) => updateCard({ backPhotoScale: parseFloat(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Horizontal</label>
                    <input type="range" min="-100" max="100" value={card.backPhotoOffsetX}
                      onChange={(e) => updateCard({ backPhotoOffsetX: parseInt(e.target.value) })}
                      className="w-full accent-red-600" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Vertical</label>
                    <input type="range" min="-100" max="100" value={card.backPhotoOffsetY}
                      onChange={(e) => updateCard({ backPhotoOffsetY: parseInt(e.target.value) })}
                      className="w-full accent-red-600" />
                  </div>
                </div>
                <button
                  onClick={() => updateCard({ backPhoto: null, backPhotoOffsetX: 0, backPhotoOffsetY: 0, backPhotoScale: 1 })}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Remove photo
                </button>
              </div>
            )}
          </div>}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button onClick={prevStep} className="text-gray-400 hover:text-white transition-colors text-sm">
            &larr; Back
          </button>
          <button
            onClick={nextStep}
            disabled={!card.playerName}
            className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-red-600/20"
          >
            Preview Card &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

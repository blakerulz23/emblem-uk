'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CardData, CardTemplate, OrderData, Sport } from '@/lib/types';

interface BuilderState {
  step: number;
  card: CardData;
  order: OrderData;
}

interface BuilderContextType extends BuilderState {
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setSport: (sport: Sport) => void;
  setTemplate: (template: CardTemplate) => void;
  updateCard: (updates: Partial<CardData>) => void;
  updateOrder: (updates: Partial<OrderData>) => void;
  resetBuilder: () => void;
}

const defaultCard: CardData = {
  sport: null,
  template: null,
  playerName: '',
  teamName: '',
  jerseyNumber: '',
  position: '',
  accentColor: '#E879F9',
  secondaryColor: '#1E3A5F',
  playerPhoto: null,
  teamLogo: null,
  photoOffsetX: 0,
  photoOffsetY: 0,
  photoScale: 1,
  showStats: false,
  stats: {},
  backText: '',
  backPhoto: null,
  backPhotoOffsetX: 0,
  backPhotoOffsetY: 0,
  backPhotoScale: 1,
  height: '',
  age: '',
  classYear: '',
  hometown: '',
};

const defaultOrder: OrderData = {
  quantity: 1,
  packType: 'single',
  firstName: '',
  lastName: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
};

const BuilderContext = createContext<BuilderContextType | null>(null);

export function BuilderProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState(1);
  const [card, setCard] = useState<CardData>(defaultCard);
  const [order, setOrder] = useState<OrderData>(defaultOrder);

  const nextStep = useCallback(() => setStep((s) => Math.min(s + 1, 5)), []);
  const prevStep = useCallback(() => setStep((s) => Math.max(s - 1, 1)), []);

  const setSport = useCallback((sport: Sport) => {
    setCard((prev) => ({ ...prev, sport, template: null }));
  }, []);

  const setTemplate = useCallback((template: CardTemplate) => {
    setCard((prev) => ({ ...prev, template }));
  }, []);

  const updateCard = useCallback((updates: Partial<CardData>) => {
    setCard((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateOrder = useCallback((updates: Partial<OrderData>) => {
    setOrder((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetBuilder = useCallback(() => {
    setStep(1);
    setCard(defaultCard);
    setOrder(defaultOrder);
  }, []);

  return (
    <BuilderContext.Provider
      value={{
        step,
        card,
        order,
        setStep,
        nextStep,
        prevStep,
        setSport,
        setTemplate,
        updateCard,
        updateOrder,
        resetBuilder,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  const context = useContext(BuilderContext);
  if (!context) throw new Error('useBuilder must be used within BuilderProvider');
  return context;
}

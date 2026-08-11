import { useEffect, useRef, useState } from 'react';
import { PricingQuoteController, type OrderPricingQuoteState } from '@/lib/pricing-quote-controller';

/**
 * Thin React wiring around PricingQuoteController (src/lib/pricing-quote-
 * controller.ts) — all debounce/race-protection/retry logic lives there,
 * fully unit-tested without a DOM. This hook only owns the controller's
 * lifecycle and re-renders the caller when its state changes.
 */
export function useOrderPricingQuote(paidPlayerCount: number, totalPrintQuantity: number) {
  const controllerRef = useRef<PricingQuoteController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new PricingQuoteController();
  }

  const [state, setState] = useState<OrderPricingQuoteState>(() => controllerRef.current!.getState());

  useEffect(() => {
    const controller = controllerRef.current!;
    return controller.subscribe(setState);
  }, []);

  useEffect(() => {
    controllerRef.current!.setCounts(paidPlayerCount, totalPrintQuantity);
  }, [paidPlayerCount, totalPrintQuantity]);

  useEffect(() => {
    const controller = controllerRef.current!;
    return () => controller.dispose();
  }, []);

  const retry = () => controllerRef.current?.retry();

  return { state, retry };
}

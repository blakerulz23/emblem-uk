import { Suspense } from 'react';
import ProductionBuilder from '@/components/emblem-uk/ProductionBuilder';

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <ProductionBuilder />
    </Suspense>
  );
}

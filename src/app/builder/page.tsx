import { Suspense } from 'react';
import ProductionBuilder from '@/components/emblem-uk/ProductionBuilder';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <ProductionBuilder squadInviteEnabled={isSquadInviteMvpEnabled()} />
    </Suspense>
  );
}

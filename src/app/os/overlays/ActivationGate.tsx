'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { osAssetPath } from '../data';
import { createClient } from '@/lib/supabase/client';
import SignIn from './SignIn';
import RoleSelect from '../screens/RoleSelect';
import RoleFork from './RoleFork';
import ClaimCodeEntry from './ClaimCodeEntry';
import ClaimConfirm from './ClaimConfirm';
import RecoverByEmail from './RecoverByEmail';
import CreateTeamOnboarding from './CreateTeamOnboarding';
import type { ClaimLookupResult } from './ClaimCodeEntry';
import type { ClaimConfirmFields } from './ClaimConfirm';

export type ActivationGateProps = {
  onActivate: () => void;
  hasSession: boolean;
  profileRole: 'parent' | 'coach' | null;
  hasClaimedPlayer: boolean;
  hasTeam: boolean;
};

const INTENT_KEY = 'emblem_pending_intent';

type PendingIntent =
  | { kind: 'claim'; source: 'card' | 'invite'; code: string; displayName: string; relationship: string }
  | { kind: 'coach' }
  | { kind: 'recover' };

function readIntent(): PendingIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    return raw ? (JSON.parse(raw) as PendingIntent) : null;
  } catch {
    return null;
  }
}

function storeIntent(intent: PendingIntent) {
  sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
}

function clearIntent() {
  sessionStorage.removeItem(INTENT_KEY);
}

/**
 * Card-first claiming (Core Product Principle #2): a brand-new visitor
 * picks a path *before* signing in — card code, no-card recovery, or
 * coach — and that choice survives the sign-in step via sessionStorage
 * (SignIn.tsx never navigates away, it's all fetch calls ending in
 * router.refresh(), so this is just plain client state, not a real
 * cross-origin redirect to preserve anything across). Once authenticated,
 * ActivationGate's branching is purely server-known facts, same as before.
 */
export default function ActivationGate({ onActivate, hasSession, profileRole, hasClaimedPlayer, hasTeam }: ActivationGateProps) {
  const router = useRouter();
  const [preAuthStep, setPreAuthStep] = useState<'fork' | 'code' | 'confirm' | 'recover' | 'auth'>('fork');
  const [pendingResult, setPendingResult] = useState<ClaimLookupResult | null>(null);
  const [resolving, setResolving] = useState(false);

  const intent = readIntent();

  // Post-auth auto-resolve: finalizes whatever was chosen before sign-in.
  useEffect(() => {
    if (!hasSession || !intent || resolving) return;
    setResolving(true);
    (async () => {
      if (intent.kind === 'claim') {
        const endpoint = intent.source === 'invite' ? '/api/os/invites/redeem' : '/api/os/claim';
        const bodyKey = intent.source === 'invite' ? 'inviteCode' : 'claimToken';
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [bodyKey]: intent.code, displayName: intent.displayName, relationship: intent.relationship }),
        });
        clearIntent();
      } else if (intent.kind === 'coach') {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('profiles').upsert({ id: user.id, role: 'coach' });
        }
        clearIntent();
      }
      // 'recover' is intentionally left in storage and NOT auto-resolved —
      // RecoverByEmail handles the interactive self/handoff decision once
      // rendered below, and clears the intent itself isn't needed since
      // that screen doesn't re-enter this pre-auth flow again.
      router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession]);

  if (!hasSession) {
    if (preAuthStep === 'auth') {
      return <SignIn />;
    }
    if (preAuthStep === 'recover') {
      return <RecoverByEmail hasSession={false} />;
    }
    if (preAuthStep === 'code') {
      return (
        <ClaimCodeEntry
          onFound={(result) => {
            setPendingResult(result);
            setPreAuthStep('confirm');
          }}
          onBack={() => setPreAuthStep('fork')}
        />
      );
    }
    if (preAuthStep === 'confirm' && pendingResult) {
      if (pendingResult.alreadyClaimed) {
        return <ClaimConfirm result={pendingResult} onConfirm={() => {}} onBack={() => setPreAuthStep('code')} />;
      }
      return (
        <ClaimConfirm
          result={pendingResult}
          onConfirm={(fields: ClaimConfirmFields) => {
            storeIntent({ kind: 'claim', source: pendingResult.source, code: pendingResult.code, ...fields });
            setPreAuthStep('auth');
          }}
          onBack={() => setPreAuthStep('code')}
        />
      );
    }
    return (
      <RoleFork
        onPickCard={() => setPreAuthStep('code')}
        onPickNoCard={() => {
          storeIntent({ kind: 'recover' });
          setPreAuthStep('recover');
        }}
        onPickCoach={() => {
          storeIntent({ kind: 'coach' });
          setPreAuthStep('auth');
        }}
      />
    );
  }

  // Authenticated from here on — branching is purely server-known facts.
  if (!profileRole) {
    if (intent?.kind === 'recover') {
      return <RecoverByEmail hasSession />;
    }
    if (intent) {
      return <ResolvingScreen />;
    }
    return <RoleSelect />;
  }

  if (profileRole === 'coach' && !hasTeam) {
    return <CreateTeamOnboarding />;
  }
  if (profileRole === 'parent' && !hasClaimedPlayer) {
    if (intent?.kind === 'recover') {
      return <RecoverByEmail hasSession />;
    }
    if (intent?.kind === 'claim') {
      return <ResolvingScreen />;
    }
    return <ClaimCodeEntryResume />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 30px', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130, background: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
      <img src={`${osAssetPath}/emblem-wordmark.png`} alt="Emblem" style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: .92, marginBottom: 40 }} />
      <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 34 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.5)', animation: 'actRing 2.2s ease-out infinite' }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.4)', animation: 'actRing 2.2s ease-out .7s infinite' }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.3)', animation: 'actRing 2.2s ease-out 1.4s infinite' }} />
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(233,116,53,.14)', border: '1.5px solid rgba(233,116,53,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5a8 8 0 0 1 0 7M10 6a13 13 0 0 1 0 12M14 4a17 17 0 0 1 0 16" /></svg>
        </div>
      </div>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>WELCOME TO EMBLEM</div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 27, lineHeight: 1.08, color: '#F4F1EC', marginBottom: 12 }}>Every football story<br />starts somewhere.</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 32px' }}>Tap your Emblem card to the back of your phone to unlock their living football journey.</p>
      <div onClick={onActivate} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#E97435', color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, padding: '15px 30px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0B0A09" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5a8 8 0 0 1 0 7M10 6a13 13 0 0 1 0 12M14 4a17 17 0 0 1 0 16" /></svg>
        Tap to activate
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, color: 'var(--os-muted)', fontSize: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B8478" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /></svg>
        Private &amp; secure
      </div>
    </div>
  );
}

function ResolvingScreen() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: '#0f0c0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, color: '#B8AE9F' }}>Finishing up…</span>
    </div>
  );
}

/**
 * A parent who's already signed in (e.g. returning on another device, or
 * RoleSelect's manual fallback was used) but hasn't claimed a player yet —
 * same code-entry/confirm UI as the pre-auth path, just without the
 * sign-in sub-step since a session already exists.
 */
function ClaimCodeEntryResume() {
  const router = useRouter();
  const [result, setResult] = useState<ClaimLookupResult | null>(null);

  if (!result) {
    return <ClaimCodeEntry onFound={setResult} />;
  }

  if (result.alreadyClaimed) {
    return <ClaimConfirm result={result} onConfirm={() => {}} onBack={() => setResult(null)} />;
  }

  return (
    <ClaimConfirm
      result={result}
      onConfirm={async (fields: ClaimConfirmFields) => {
        const endpoint = result.source === 'invite' ? '/api/os/invites/redeem' : '/api/os/claim';
        const bodyKey = result.source === 'invite' ? 'inviteCode' : 'claimToken';
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [bodyKey]: result.code, displayName: fields.displayName, relationship: fields.relationship }),
        });
        router.refresh();
      }}
      onBack={() => setResult(null)}
    />
  );
}

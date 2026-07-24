import OsApp from './OsApp';
import { getOsAccount, getOsData } from '@/lib/os-data';

export default async function OsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const requestedPlayerId = typeof searchParams?.player === 'string' ? searchParams.player : null;

  const { session, profileRole, hasClaimedPlayer, hasTeam } = await getOsAccount();
  const initialData = await getOsData(session?.userId ?? null, profileRole, requestedPlayerId);

  return (
    <OsApp
      initialData={initialData}
      hasSession={!!session}
      profileRole={profileRole}
      hasClaimedPlayer={hasClaimedPlayer}
      hasTeam={hasTeam}
    />
  );
}

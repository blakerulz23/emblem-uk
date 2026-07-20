import OsApp from './OsApp';
import { getOsAccount, getOsData } from '@/lib/os-data';

export default async function OsPage() {
  const { session, profileRole, hasClaimedPlayer, hasTeam } = await getOsAccount();
  const initialData = await getOsData(session?.userId ?? null, profileRole);

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

import OsApp from './OsApp';
import { getOsAccount, getOsData } from '@/lib/os-data';

export default async function OsPage() {
  const { session, profileRole } = await getOsAccount();
  const initialData = await getOsData(session?.userId ?? null);

  return <OsApp initialData={initialData} hasSession={!!session} profileRole={profileRole} />;
}

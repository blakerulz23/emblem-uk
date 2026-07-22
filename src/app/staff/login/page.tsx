import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import StaffLoginForm from './StaffLoginForm';
import StaffNotAuthorized from './StaffNotAuthorized';

export const dynamic = 'force-dynamic';

const DEFAULT_NEXT = '/staff/queue';

type SearchParams = Record<string, string | string[] | undefined>;

function safeNextPath(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.startsWith('//') || !raw.startsWith('/staff')) return DEFAULT_NEXT;

  try {
    const url = new URL(raw, 'https://emblem.local');
    if (url.origin !== 'https://emblem.local' || !url.pathname.startsWith('/staff')) {
      return DEFAULT_NEXT;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

export default async function StaffLoginPage({ searchParams }: { searchParams?: SearchParams }) {
  const next = safeNextPath(searchParams?.next);
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);

  if (staffCheck.ok) {
    redirect(next);
  }

  if (staffCheck.status === 403) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return <StaffNotAuthorized email={user?.email ?? null} />;
  }

  return <StaffLoginForm next={next} />;
}
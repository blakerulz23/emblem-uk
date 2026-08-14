import { notFound } from 'next/navigation';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import OrganiserStart from './OrganiserStart';

export const dynamic='force-dynamic';
export default function SquadInviteStartPage(){
  if(!isSquadInviteMvpEnabled()) notFound();
  return <OrganiserStart/>;
}

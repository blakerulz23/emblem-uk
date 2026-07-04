export const EAST_MANCHESTER_LEAGUE = 'East Manchester Junior Football League';

export type EmjflTemplatePreference =
  | 'emjfl-official'
  | 'hollinwood-blue'
  | 'hollinwood-green'
  | 'hollinwood-red'
  | 'hollinwood-gold';

export type EmjflClub = {
  id: string;
  name: string;
  badgePath: string;
  leagueName: typeof EAST_MANCHESTER_LEAGUE;
  preferredTemplateId: EmjflTemplatePreference;
};

export const EMJFL_CLUBS: EmjflClub[] = [
  { id: 'curzon-ashton', name: 'Curzon Ashton Juniors', badgePath: '/templates/emjfl/clubs/curzon-ashton.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'hollinwood-blue' },
  { id: 'ashton-united', name: 'Ashton United FC', badgePath: '/templates/emjfl/clubs/ashton-united.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'hollinwood-red' },
  { id: 'wythenshawe-town', name: 'Wythenshawe Town FC', badgePath: '/templates/emjfl/clubs/wythenshawe-town.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'wythenshawe-fc', name: 'Wythenshawe FC', badgePath: '/templates/emjfl/clubs/wythenshawe-fc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'abbey-hey', name: 'Abbey Hey FC', badgePath: '/templates/emjfl/clubs/abbey-hey.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'saddleworth-3ds', name: 'Saddleworth 3Ds', badgePath: '/templates/emjfl/clubs/saddleworth-3ds.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'hollinwood-gold' },
  { id: 'irlam-jfc', name: 'Irlam JFC', badgePath: '/templates/emjfl/clubs/irlam-jfc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'milnrow-juniors', name: 'Milnrow Juniors', badgePath: '/templates/emjfl/clubs/milnrow-juniors.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'failsworth-villa', name: 'Failsworth Villa FC', badgePath: '/templates/emjfl/clubs/failsworth-villa.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'failsworth-dynamos', name: 'Failsworth Dynamos', badgePath: '/templates/emjfl/clubs/failsworth-dynamos.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'mcjfc', name: 'MCJFC', badgePath: '/templates/emjfl/clubs/mcjfc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'cheadle-town', name: 'Cheadle Town FC', badgePath: '/templates/emjfl/clubs/cheadle-town.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'avro-fc', name: 'AVRO Football Club', badgePath: '/templates/emjfl/clubs/avro-fc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'glossop-north-end', name: 'Glossop North End AFC', badgePath: '/templates/emjfl/clubs/glossop-north-end.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'santos', name: 'Santos', badgePath: '/templates/emjfl/clubs/santos.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'safc', name: 'S.A.F.C.', badgePath: '/templates/emjfl/clubs/safc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'trafford-fc', name: 'Trafford Football Club', badgePath: '/templates/emjfl/clubs/trafford-fc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'hollinwood-green' },
  { id: 'hazel-grove-united', name: 'Hazel Grove United JFC', badgePath: '/templates/emjfl/clubs/hazel-grove-united.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'ocfc', name: 'OCFC', badgePath: '/templates/emjfl/clubs/ocfc.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
  { id: 'afc-oldham', name: 'AFC Oldham', badgePath: '/templates/emjfl/clubs/afc-oldham.png', leagueName: EAST_MANCHESTER_LEAGUE, preferredTemplateId: 'emjfl-official' },
];

export const DEFAULT_EMJFL_CLUB = EMJFL_CLUBS[0];

export function getEmjflClub(id?: string) {
  return EMJFL_CLUBS.find((club) => club.id === id) || DEFAULT_EMJFL_CLUB;
}

export function preferredTemplateForClub(id?: string) {
  return getEmjflClub(id).preferredTemplateId;
}

export function clubBadgePath(id?: string) {
  return getEmjflClub(id).badgePath;
}

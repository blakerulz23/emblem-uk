import { describe, expect, it } from 'vitest';
import { initialOrganiserForm, ORGANISER_DECLARATIONS, validateOrganiserForm } from './squad-invite-organiser-form';

const now = new Date('2026-08-14T12:00:00Z');
const valid = { ...initialOrganiserForm, organiserName:'Synthetic Organiser', organiserRole:'team_manager', teamName:'Synthetic FC', ageGroup:'Under 10', expectedSquadSize:'10', deadlineAt:'2026-08-23', deliveryRecipientName:'Synthetic Recipient', deliveryRecipientRole:'Team coordinator', ukDeliveryConfirmed:true, authorityAccepted:true, deliveryRecipientAccepted:true, independentParticipationAccepted:true, staffReviewAccepted:true };

describe('Squad Invite organiser review validation',()=>{
  it('accepts a completed form and its native YYYY-MM-DD future deadline',()=>expect(validateOrganiserForm(valid,now)).toEqual([]));
  it.each(['2026-08-14','2026-08-13','23/08/2026','2026-02-30'])('rejects a today, past or invalid deadline: %s',deadlineAt=>expect(validateOrganiserForm({...valid,deadlineAt},now).some(error=>error.field==='deadlineAt')).toBe(true));
  it.each(['organiserName','organiserRole','teamName','ageGroup','expectedSquadSize','deadlineAt','deliveryRecipientName','deliveryRecipientRole'] as const)('identifies a missing required field: %s',field=>expect(validateOrganiserForm({...valid,[field]:''},now).some(error=>error.field===field)).toBe(true));
  it('requires the visible consolidated UK delivery confirmation',()=>expect(validateOrganiserForm({...valid,ukDeliveryConfirmed:false},now)[0].field).toBe('ukDeliveryConfirmed'));
  it.each(ORGANISER_DECLARATIONS)('identifies an unchecked declaration: %s',field=>expect(validateOrganiserForm({...valid,[field]:false},now).some(error=>error.field===field)).toBe(true));
});

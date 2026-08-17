import { describe, expect, it } from 'vitest';
import { initialOrganiserForm, ORGANISER_DECLARATIONS, projectedSquadIncentive, validateOrganiserForm } from './squad-invite-organiser-form';

const now = new Date('2026-08-14T12:00:00Z');
const valid = { ...initialOrganiserForm, organiserName:'Synthetic Organiser', organiserRole:'team_manager', teamName:'Synthetic FC', ageGroup:'Under 10', expectedSquadSize:'10', deadlineAt:'2026-08-23', deliveryRecipientName:'Synthetic Recipient', deliveryRecipientRole:'Team coordinator', ukDeliveryConfirmed:true, authorityAccepted:true, deliveryRecipientAccepted:true, independentParticipationAccepted:true, staffReviewAccepted:true };

describe('Squad Invite organiser review validation',()=>{
  it('accepts a completed form and its native YYYY-MM-DD future deadline',()=>expect(validateOrganiserForm(valid,now)).toEqual([]));
  it.each(['2026-08-14','2026-08-13','23/08/2026','2026-02-30'])('rejects a today, past or invalid deadline: %s',deadlineAt=>expect(validateOrganiserForm({...valid,deadlineAt},now).some(error=>error.field==='deadlineAt')).toBe(true));
  it.each(['organiserName','organiserRole','teamName','ageGroup','expectedSquadSize','deadlineAt','deliveryRecipientName','deliveryRecipientRole'] as const)('identifies a missing required field: %s',field=>expect(validateOrganiserForm({...valid,[field]:''},now).some(error=>error.field===field)).toBe(true));
  it('requires the visible consolidated UK delivery confirmation',()=>expect(validateOrganiserForm({...valid,ukDeliveryConfirmed:false},now)[0].field).toBe('ukDeliveryConfirmed'));
  it.each(ORGANISER_DECLARATIONS)('identifies an unchecked declaration: %s',field=>expect(validateOrganiserForm({...valid,[field]:false},now).some(error=>error.field===field)).toBe(true));
});

describe('projectedSquadIncentive — organiser-facing pricing projection, never a promise',()=>{
  it.each(['','0','-1','abc','1.5'])('returns null for an empty or invalid estimate: %s',value=>expect(projectedSquadIncentive(value)).toBeNull());
  it('projects single tier below the multi threshold',()=>{const result=projectedSquadIncentive('1');expect(result?.tier).toBe('single');expect(result?.detail).toContain('1 more player');});
  it('projects multi tier at the multi threshold',()=>{const result=projectedSquadIncentive('2');expect(result?.tier).toBe('multi');expect(result?.detail).toContain('8 more players');});
  it('projects multi tier just below the squad threshold',()=>{const result=projectedSquadIncentive('9');expect(result?.tier).toBe('multi');expect(result?.detail).toContain('1 more player');expect(result?.detail).not.toContain('1 more players');});
  it('projects squad tier at the squad threshold',()=>{const result=projectedSquadIncentive('10');expect(result?.tier).toBe('squad');expect(result?.detail).toContain('free coach card');});
  it('projects squad tier above the squad threshold',()=>{expect(projectedSquadIncentive('25')?.tier).toBe('squad');});
  it('never words a projection as a guarantee — no line drops the projection/estimate framing entirely', () => {
    for (const value of ['1','2','10']) {
      const result = projectedSquadIncentive(value);
      expect(result?.headline.startsWith('Projected:')).toBe(true);
    }
  });
});

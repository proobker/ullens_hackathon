import { expect,it } from 'vitest';
import { lifecycle,type LifecycleEvent } from '@pran-rekha/domain';
import type { MedicationRecord } from '@pran-rekha/contracts';
const date=(d:string)=>({rawText:d,calendar:'AD' as const,precision:'day' as const,adDate:d,instant:null,sourceTimezone:null,conversionVersion:null,confirmedBy:'doctor'});
const record:MedicationRecord={id:'rx',patientId:'p',prescriptionStreamId:'s',drug:{rawText:'Unresolved brand',genericName:null,resolution:'unresolved',aliasEntryId:null,aliasTableVersion:null},doseText:'५०० mg',frequencyText:'1-0-1',routeText:null,durationText:'five days',startDate:date('2026-09-01'),endDate:null,prescriberText:'doctor',organisationText:'Demo',sourceRefs:[{kind:'attestation',sourceId:'source',version:1,sha256:'a'.repeat(64),field:'text'}],recordedAt:'2026-09-01T00:00:00Z',mode:'synthetic_fixture'};
const event=(kind:LifecycleEvent['kind'],day:string,revision:number):LifecycleEvent=>({id:'e'+revision,recordId:'rx',patientId:'p',streamId:'s',revision,effectiveDate:day,kind,source:'Prescriber statement',actorId:'doctor',recordedAt:'2026-10-03T00:00:00Z'});
const asOf='2026-10-03T00:00:00Z';
it('uses effective dates despite delayed upload and leaves same-day contradictions conflicting',()=>{
  expect(lifecycle(record,[event('stopped','2026-09-20',1),event('started','2026-09-01',2)],asOf).state).toBe('stopped');
  expect(lifecycle(record,[event('started','2026-09-01',1),event('stopped','2026-09-01',2)],asOf).state).toBe('conflict');
});
it('bounds active status by explicit course end and never derives end from duration text',()=>{
  expect(lifecycle({...record,endDate:date('2026-09-10')},[event('started','2026-09-01',1)],asOf).state).toBe('course_end_passed');
  expect(lifecycle(record,[],asOf)).toMatchObject({state:'unknown',endDate:null,doseText:'५०० mg'});
});
it('preserves hold, completion and supersession distinctly',()=>{
  for(const [kind,state] of [['held','held'],['completed','completed'],['substituted','superseded']] as const)expect(lifecycle(record,[event(kind,'2026-09-01',1)],asOf).state).toBe(state);
});
it('requires valid earlier correction/retraction targets and retains event history',()=>{
  const events=[event('started','2026-09-01',1),{...event('retracted','2026-09-02',2),targetEventId:'e1'}];
  expect(lifecycle(record,events,asOf).state).toBe('unknown');expect(events).toHaveLength(2);
  expect(()=>lifecycle(record,[{...event('retracted','2026-09-02',1),targetEventId:'missing'}],asOf)).toThrow();
});

import type { MedicationRecord, MedState, PrescriptionView } from '@pran-rekha/contracts';
export type LifecycleEvent={
  id:string;recordId:string;patientId:string;streamId:string;revision:number;effectiveDate:string;
  kind:'started'|'stopped'|'held'|'resumed'|'completed'|'status_confirmed'|'dose_changed'|'substituted'|'corrected'|'retracted';
  status?:'documented_active'|'unknown';targetEventId?:string;replacementEventId?:string;replacementRecordId?:string;
  source:string;actorId:string;recordedAt:string;
};
export function lifecycle(record:MedicationRecord,events:LifecycleEvent[],asOf:string):PrescriptionView {
  const own=events.filter(e=>e.recordId===record.id&&e.patientId===record.patientId&&e.streamId===record.prescriptionStreamId);
  const excluded=new Set<string>();
  for(const event of own){
    if(event.kind==='corrected'||event.kind==='retracted'){
      if(!event.targetEventId||!own.some(e=>e.id===event.targetEventId&&e.revision<event.revision))throw new Error('INVALID_EVENT_LINK');
      if(excluded.has(event.targetEventId))throw new Error('REPEATED_RETRACTION');
      const target=own.find(e=>e.id===event.targetEventId)!;
      if(['corrected','retracted'].includes(target.kind))throw new Error('INVALID_EVENT_LINK');
      if(event.kind==='corrected'&&(!event.replacementEventId||!own.some(e=>e.id===event.replacementEventId&&e.id!==event.targetEventId&&!['corrected','retracted'].includes(e.kind))))throw new Error('INVALID_EVENT_LINK');
      if(event.effectiveDate<=asOf.slice(0,10))excluded.add(event.targetEventId);
    }
  }
  const applicable=own.filter(e=>!excluded.has(e.id)&&!['corrected','retracted'].includes(e.kind)&&e.effectiveDate<=asOf.slice(0,10)).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  const latest=applicable.at(-1),last=latest?applicable.filter(e=>e.effectiveDate===latest.effectiveDate):[];
  const stateFor=(e:LifecycleEvent):MedState=>e.kind==='status_confirmed'?(e.status??'unknown'):e.kind==='started'||e.kind==='resumed'?'documented_active':e.kind==='dose_changed'||e.kind==='substituted'?'superseded':['held','stopped','completed'].includes(e.kind)?e.kind as MedState:'unknown';
  const states=new Set(last.map(stateFor));
  let state:MedState=states.size>1?'conflict':latest?stateFor(latest):'unknown';
  if(record.endDate?.adDate&&record.endDate.adDate<asOf.slice(0,10)&&!['stopped','completed','superseded','conflict'].includes(state))state='course_end_passed';
  return {recordId:record.id,prescriptionStreamId:record.prescriptionStreamId,state,basis:state==='conflict'?'Same-day incompatible instructions require reconciliation.':state==='unknown'?'No explicit current-status evidence.':'State derived from dated prescription evidence: '+state,basisEventIds:last.map(e=>e.id),drug:record.drug,doseText:record.doseText,frequencyText:record.frequencyText,startDate:record.startDate,endDate:record.endDate,asOf,sourceRevision:Math.max(0,...own.map(e=>e.revision))};
}

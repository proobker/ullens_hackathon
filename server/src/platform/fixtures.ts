import type { MedicationRecord } from '@pran-rekha/contracts';
import type { LifecycleEvent } from '@pran-rekha/domain';
import { digest, type PlatformStore, type Profile } from './store.js';
export function seedMedicationMatrix(store:PlatformStore){
  if(store.get('med-record','fixture-active'))return;
  const pid='PR-9042-8819',p=store.get<Profile>('profile',pid);
  if(!p)return;
  const date=(d:string)=>({rawText:d,calendar:'AD' as const,precision:'day' as const,adDate:d,instant:null,sourceTimezone:null,conversionVersion:null,confirmedBy:'portal-lab'});
  const states=['active','unknown','stopped','ended','held','brand','dose-change','conflict'];
  const entries=states.map((name,index)=>{
    const id='fixture-'+name,source='Fictional prescription '+name+': Demo medicine '+index+', dose १ tablet, frequency 1-0-1. '+(name==='active'?'Active status explicitly documented.':'');
    const sourceId=id+'-attestation';
    const record:MedicationRecord={id,patientId:pid,prescriptionStreamId:id+'-stream',drug:{rawText:name==='brand'?'Unresolved demo brand':'Demo medicine '+index,genericName:null,resolution:name==='brand'?'unresolved':'verbatim',aliasEntryId:null,aliasTableVersion:null},doseText:'१ tablet',frequencyText:'1-0-1',routeText:null,durationText:null,startDate:date('2026-08-20'),endDate:name==='ended'?date('2026-08-25'):null,prescriberText:'Fictional clinician',organisationText:'Fictional Clinic Two',sourceRefs:[{kind:'attestation',sourceId,version:1,sha256:digest(source),field:'text'}],recordedAt:'2026-08-20T04:30:00.000Z',mode:'synthetic_fixture'};
    store.put('attestation',sourceId,{id:sourceId,patientId:pid,text:source,actorId:'portal-lab',at:record.recordedAt});store.put('med-record',id,record);
    const kind:LifecycleEvent['kind']=name==='stopped'?'stopped':name==='held'?'held':name==='dose-change'?'dose_changed':'started';
    if(!['unknown','brand','ended'].includes(name)){
      const event:LifecycleEvent={id:id+'-event',recordId:id,patientId:pid,streamId:record.prescriptionStreamId,revision:1,effectiveDate:'2026-08-20',kind,source,actorId:'portal-lab',recordedAt:record.recordedAt,...(name==='dose-change'?{replacementRecordId:'fixture-active'}:{})};
      store.put('med-event',event.id,event);
      if(name==='conflict')store.put('med-event',id+'-stop',{...event,id:id+'-stop',kind:'stopped',revision:2,source:'Same-day conflicting synthetic instruction.'});
    }
    return {id,kind:'medication' as const,text:record.drug.rawText+' · '+record.doseText+' · '+record.frequencyText,date:'2026-08-20',source:'Fictional Clinic Two · prescription',excerpt:source,author:'portal-lab',reviewed:true};
  });
  p.entries.push(...entries);
  p.versions.push(store.signVersion({id:'medication-fixture-version',patientId:pid,revision:1,facility:'lab-demo',signer:'Fictional clinician',signedAt:'2026-08-20T04:30:00.000Z',reviewDue:p.reviewDue,entries}));
  // Medication evidence defaults out until the patient explicitly includes each entry.
  store.put('profile',pid,p);
  store.put('med-use','fixture-use',{id:'fixture-use',recordId:'fixture-active',patientId:pid,actorId:'portal-siddharth',role:'patient',use:'taking',statement:'Synthetic report: taking as reported.',lastDose:'Yesterday evening, reported',reportedAt:'2026-10-02T04:30:00.000Z'});
}

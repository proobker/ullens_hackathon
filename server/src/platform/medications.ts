import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MedicationRecordSchema, type MedicationRecord } from '@pran-rekha/contracts';
import { lifecycle, type LifecycleEvent } from '@pran-rekha/domain';
import { digest, type PlatformStore, type Staff } from './store.js';
const text=z.string().min(1).max(2000);
const EventInput=z.object({requestId:text,expectedRevision:z.number().int().nonnegative(),kind:z.enum(['started','stopped','held','resumed','completed','status_confirmed','dose_changed','substituted','corrected','retracted']),effectiveDate:z.iso.date(),source:text,status:z.enum(['documented_active','unknown']).optional(),targetEventId:text.optional(),replacementEventId:text.optional(),replacementRecordId:text.optional()}).strict();
export function medicationsRouter(store:PlatformStore,clock:()=>Date){
  const router=Router();
  function allowed(s:Staff,pid:string,write=false){
    const owner=store.db.prepare('SELECT 1 FROM actor_patient_bindings WHERE actor_id=? AND patient_id=?').get(s.id,pid);
    const assigned=store.all<{actor:string;patient:string}>('assignment').some(a=>a.actor===s.id&&a.patient===pid);
    if(write?!(s.role==='clinician'&&assigned):!(owner||assigned))throw new Error('FORBIDDEN');
  }
  router.get('/profiles/:id/medications',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id);allowed(s,pid);
      const events=store.all<LifecycleEvent>('med-event');
      res.json(store.all<MedicationRecord>('med-record').filter(r=>r.patientId===pid).map(record=>({record,view:lifecycle(record,events,clock().toISOString()),events:events.filter(e=>e.recordId===record.id),useReports:store.all<{recordId:string}>('med-use').filter(u=>u.recordId===record.id)})));
    }catch(e){next(e);}
  });
  router.post('/profiles/:id/medications',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id);allowed(s,pid,true);
      const input=z.object({requestId:text,drugText:text,doseText:text,frequencyText:text,source:text,startDate:z.iso.date().nullable(),endDate:z.iso.date().nullable()}).strict().parse(req.body);
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{
        const id=randomUUID(),sourceId=randomUUID();
        store.put('attestation',sourceId,{id:sourceId,patientId:pid,text:input.source,actorId:s.id,at:clock().toISOString()});
        const date=(d:string|null)=>d?{rawText:d,calendar:'AD',precision:'day',adDate:d,instant:null,sourceTimezone:null,conversionVersion:null,confirmedBy:s.id}:null;
        const record=MedicationRecordSchema.parse({id,patientId:pid,prescriptionStreamId:randomUUID(),drug:{rawText:input.drugText,genericName:null,resolution:'verbatim',aliasEntryId:null,aliasTableVersion:null},doseText:input.doseText,frequencyText:input.frequencyText,routeText:null,durationText:null,startDate:date(input.startDate),endDate:date(input.endDate),prescriberText:s.id,organisationText:s.facility,sourceRefs:[{kind:'attestation',sourceId,version:1,sha256:digest(input.source),field:'text'}],recordedAt:clock().toISOString(),mode:'synthetic_fixture'});
        store.put('med-record',id,record);return record;
      }));
    }catch(e){next(e);}
  });
  router.post('/medications/:id/events',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,record=store.get<MedicationRecord>('med-record',String(req.params.id));if(!record)throw new Error('FORBIDDEN');allowed(s,record.patientId,true);
      const input=EventInput.parse(req.body);
      res.json(store.mutate(s.id,input.requestId,{recordId:record.id,...input},()=>{
        const events=store.all<LifecycleEvent>('med-event').filter(e=>e.recordId===record.id);
        if(Math.max(0,...events.map(e=>e.revision))!==input.expectedRevision)throw new Error('CONFLICT');
        if(input.kind==='status_confirmed'&&!input.status)throw new Error('INVALID_INPUT');
        if(['dose_changed','substituted'].includes(input.kind)){
          const replacement=input.replacementRecordId&&store.get<MedicationRecord>('med-record',input.replacementRecordId);
          if(!replacement||replacement.patientId!==record.patientId||replacement.id===record.id)throw new Error('INVALID_INPUT');
        }
        const {requestId,expectedRevision,...body}=input;
        const event:LifecycleEvent={...body,id:randomUUID(),recordId:record.id,patientId:record.patientId,streamId:record.prescriptionStreamId,revision:expectedRevision+1,actorId:s.id,recordedAt:clock().toISOString()};
        const view=lifecycle(record,[...events,event],clock().toISOString());store.put('med-event',event.id,event);
        return {event,view};
      }));
    }catch(e){next(e);}
  });
  router.post('/medications/:id/use-reports',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,record=store.get<MedicationRecord>('med-record',String(req.params.id));if(!record)throw new Error('FORBIDDEN');allowed(s,record.patientId);
      const input=z.object({requestId:text,use:z.enum(['taking','not_taking','uncertain']),lastDose:text.nullable(),statement:text}).strict().parse(req.body);
      res.json(store.mutate(s.id,input.requestId,{recordId:record.id,...input},()=>{
        const report={...input,id:randomUUID(),recordId:record.id,patientId:record.patientId,actorId:s.id,role:s.role,reportedAt:clock().toISOString()};
        store.put('med-use',report.id,report);return report;
      }));
    }catch(e){next(e);}
  });
  return router;
}

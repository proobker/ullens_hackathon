import { Router } from 'express';
import { randomUUID, sign } from 'node:crypto';
import { z } from 'zod';
import { CardSchema, DispatchRequestSchema, EntrySchema, GrantRequestSchema, PlatformProfileSchema, ReleaseRequestSchema, ScanSchema, SignRequestSchema, type Alert } from '@pran-rekha/contracts/platform';
import { canonical, digest, freshness, NOTICE, PlatformStore, sixMonths, type Profile, type Staff } from './store.js';
import { intakeRouter } from './intake.js';
import { operationsRouter } from './operations.js';
import { medicationsRouter } from './medications.js';
import { lifecycle, type LifecycleEvent } from '@pran-rekha/domain';
import type { MedicationRecord } from '@pran-rekha/contracts';
type Grant = {id:string;actor:string;patient:string;deviceId:string;releaseRevision:number;expiresAt:string;purpose:string};
type Linkage = {id:string;actor:string;patient:string;expiresAt:string};
type Reader = {id:string;tokenHash:string;revoked:boolean;lastSeen:string|null};
const text=z.string().min(1).max(500);
const mutation=z.object({requestId:text,expectedRevision:z.number().int().nonnegative()});
const unavailable=()=>{throw new Error('FORBIDDEN');};

export function platformRouter(store:PlatformStore,clock:()=>Date) {
  const router=Router();
  // Alert changes wake SSE subscribers; payloads stay out of the stream.
  const listeners=new Set<()=>void>();
  const notify=()=>{for(const listener of listeners)listener();};
  function profile(id:string):Profile { const p=store.get<Profile>('profile',id); if(!p) return unavailable(); return p; }
  function owner(actor:string,pid:string) {
    return Boolean(store.db.prepare('SELECT 1 FROM actor_patient_bindings WHERE actor_id=? AND patient_id=?').get(actor,pid));
  }
  function allowedFull(staff:Staff,pid:string) {
    return owner(staff.id,pid)||store.all<{actor:string;patient:string}>('assignment').some(a=>a.actor===staff.id&&a.patient===pid);
  }
  function project(pid:string,actor:string,purpose:string,expiresAt:string) {
    const p=profile(pid);
    if(p.release.revoked) throw new Error('GRANT_REVOKED');
    if(!store.verifyProfile(p)) throw new Error('SIGNATURE_INVALID');
    const entries=p.entries.filter(e=>p.release.allowedEntryIds.includes(e.id)).map(entry=>{
      if(entry.kind!=='medication')return entry;
      const record=store.get<MedicationRecord>('med-record',entry.id);if(!record)return entry;
      const view=lifecycle(record,store.all<LifecycleEvent>('med-event'),clock().toISOString());
      return {...entry,text:entry.text+' · '+view.state+' · actual use not established'};
    });
    const receiptId=store.receipt(pid,actor,purpose,entries.map(e=>e.id),clock());
    return CardSchema.parse({patientId:pid,name:p.name,entries,notice:NOTICE,generatedAt:clock().toISOString(),expiresAt,receiptId});
  }
  function grant(id:string,actor:string,sessionHash:string) {
    const g=store.get<Grant>('grant',id);
    const binding=store.get<{sessionHash:string}>('grant-session',id);
    if(!g||g.actor!==actor||!binding||binding.sessionHash!==sessionHash) return unavailable();
    if(Date.parse(g.expiresAt)<=clock().getTime()) throw new Error('GRANT_EXPIRED');
    const p=profile(g.patient);
    if(p.release.revoked||p.release.revision!==g.releaseRevision) throw new Error('GRANT_REVOKED');
    return g;
  }
  // Device endpoint accepts scan events only. It never returns linkage or records.
  router.post('/rfid/scans',(req,res,next)=>{
    try {
      const input=ScanSchema.parse(req.body), reader=store.get<Reader>('reader',input.deviceId);
      if(!reader||reader.revoked||digest(req.header('authorization')?.replace(/^Bearer /,'')??'')!==reader.tokenHash) return unavailable();
      const result=store.mutate('device:'+reader.id,input.eventId,input,()=>{
        reader.lastSeen=clock().toISOString();store.put('reader',reader.id,reader);
        store.put('scan',input.eventId,{...input,receivedAt:reader.lastSeen});
        return {accepted:true,eventId:input.eventId};
      });
      res.json(result);
    }catch(e){next(e);}
  });
  router.use((req,res,next)=>{
    const actor=res.locals.actor as {id:string}|undefined;
    if(!actor){res.status(401).json({error:{code:'FORBIDDEN',message:'Resource unavailable.',retryable:false},requestId:randomUUID()});return;}
    res.locals.staff=store.staff(actor.id)??{id:actor.id,role:'patient',facility:'',unit:'',reader:''};
    next();
  });
  router.use(intakeRouter(store,clock));
  router.use(operationsRouter(store,clock));
  router.use(medicationsRouter(store,clock));
  router.get('/context',(_req,res)=>{
    const s=res.locals.staff as Staff;
    res.json({staff:s,patients:store.all<Profile>('profile').filter(p=>allowedFull(s,p.id)).map(p=>({id:p.id,name:p.name})),destinations:[{id:'hospital-demo',name:'Pran Rekha Demonstration Hospital'}]});
  });
  router.get('/profiles/:id',(req,res,next)=>{
    try {const s=res.locals.staff as Staff;const p=profile(String(req.params.id));if(!allowedFull(s,p.id))return unavailable();
      if(!store.verifyProfile(p))throw new Error('SIGNATURE_INVALID');
      res.json(PlatformProfileSchema.parse({...p,freshness:freshness(p.reviewDue,clock())}));
    }catch(e){next(e);}
  });
  router.post('/profiles/:id/sign',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff, pid=String(req.params.id), input=SignRequestSchema.parse(req.body);
      if(s.role!=='clinician'||s.facility!=='lab-demo'||!allowedFull(s,pid))return unavailable();
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{
        const p=profile(pid);if(p.revision!==input.expectedRevision)throw new Error('CONFLICT');
        const entries=input.entries.map(e=>({...e,id:randomUUID(),author:s.id,reviewed:true}));
        const version=store.signVersion({id:randomUUID(),patientId:pid,revision:p.revision+1,facility:s.facility,signer:s.id,signedAt:clock().toISOString(),reviewDue:sixMonths(clock()).toISOString(),entries});
        p.entries.push(...entries);p.versions.push(version);p.revision++;p.reviewDue=version.reviewDue;
        store.put('profile',pid,p);store.put('ledger',version.id,{id:version.id,facility:s.facility,patientId:pid,amountMinor:5000,commissionMinor:400,currency:'USD',simulated:true,at:clock().toISOString()});
        return version;
      }));
    }catch(e){next(e);}
  });
  router.post('/profiles/:id/reports',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id);
      const input=mutation.extend({text:z.string().min(1).max(2000),date:z.iso.date()}).strict().parse(req.body);
      if(!owner(s.id,pid))return unavailable();
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{
        const p=profile(pid);if(p.revision!==input.expectedRevision)throw new Error('CONFLICT');
        const entry=EntrySchema.parse({id:randomUUID(),kind:'report',text:input.text,date:input.date,source:'Patient attestation',excerpt:input.text,author:s.id,reviewed:false});
        p.entries.push(entry);p.revision++;store.put('profile',pid,p);return entry;
      }));
    }catch(e){next(e);}
  });
  router.post('/profiles/:id/release',(req,res,next)=>{
    try {
      const s=res.locals.staff as Staff,pid=String(req.params.id),input=ReleaseRequestSchema.parse(req.body);if(!owner(s.id,pid))return unavailable();
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{
        const p=profile(pid);if(p.revision!==input.expectedRevision)throw new Error('CONFLICT');
        if(input.allowedEntryIds.some(id=>!p.entries.some(e=>e.id===id)))throw new Error('INVALID_INPUT');
        p.release={revision:p.release.revision+1,allowedEntryIds:[...new Set(input.allowedEntryIds)],revoked:false};p.revision++;
        store.put('profile',pid,p);return p.release;
      }));
    }catch(e){next(e);}
  });
  router.post('/profiles/:id/revoke',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id),input=mutation.strict().parse(req.body);if(!owner(s.id,pid))return unavailable();
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{const p=profile(pid);if(p.revision!==input.expectedRevision)throw new Error('CONFLICT');p.release.revoked=true;p.release.revision++;p.revision++;store.put('profile',pid,p);return {revoked:true};}));
    }catch(e){next(e);}
  });
  router.get('/profiles/:id/receipts',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,pid=String(req.params.id);if(!owner(s.id,pid))return unavailable();
      res.json((store.db.prepare('SELECT body FROM platform_receipts WHERE patient_id=? ORDER BY rowid DESC').all(pid) as {body:string}[]).map(r=>JSON.parse(r.body)));
    }catch(e){next(e);}
  });
  router.post('/linkage',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;
      if(!['paramedic','clinician'].includes(s.role))return unavailable();
      const input=z.object({locator:text}).strict().parse(req.body);
      const p=store.all<Profile>('profile').find(p=>p.locator===input.locator);if(!p)return unavailable();
      const link:Linkage={id:randomUUID(),actor:s.id,patient:p.id,expiresAt:new Date(clock().getTime()+120000).toISOString()};
      store.put('link',link.id,link);res.json({linkageId:link.id,patientId:p.id});
    }catch(e){next(e);}
  });
  router.get('/rfid/pending',(_req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;if(!s.reader)return unavailable();
      const reader=store.get<Reader>('reader',s.reader);if(!reader||reader.revoked)return unavailable();
      const scans=store.all<{deviceId:string;tagUid:string;eventId:string;receivedAt:string}>('scan').filter(e=>e.deviceId===s.reader&&Date.parse(e.receivedAt)>clock().getTime()-120000).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
      const scan=scans[0];if(!scan){res.json({state:reader.lastSeen&&Date.parse(reader.lastSeen)>clock().getTime()-60000?'READY':'DISCONNECTED'});return;}
      const tag=store.get<{patientId:string;revoked:boolean}>('tag',scan.tagUid);
      if(!tag||tag.revoked){res.json({state:'UNKNOWN_TAG',eventId:scan.eventId});return;}
      const link:Linkage={id:randomUUID(),actor:s.id,patient:tag.patientId,expiresAt:new Date(clock().getTime()+120000).toISOString()};
      store.put('link',link.id,link);res.json({state:'CANDIDATE',eventId:scan.eventId,patientId:tag.patientId,linkageId:link.id});
    }catch(e){next(e);}
  });
  router.post('/grants',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,input=GrantRequestSchema.parse(req.body);
      if(!['paramedic','clinician'].includes(s.role))return unavailable();
      res.json(store.mutate(s.id,input.requestId,input,()=>{
        const link=store.get<Linkage>('link',input.linkageId);if(!link||link.actor!==s.id||link.patient!==input.patientId||Date.parse(link.expiresAt)<=clock().getTime())return unavailable();
        const p=profile(input.patientId);if(p.release.revoked)throw new Error('GRANT_REVOKED');
        const g:Grant={id:randomUUID(),actor:s.id,patient:p.id,deviceId:input.deviceId,releaseRevision:p.release.revision,expiresAt:new Date(clock().getTime()+600000).toISOString(),purpose:input.purpose};
        store.put('grant',g.id,g);
        store.put('grant-session',g.id,{sessionHash:res.locals.tokenHash});
        return g;
      }));
    }catch(e){next(e);}
  });
  router.post('/cards',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,input=z.object({grantId:text}).strict().parse(req.body);
      const g=grant(input.grantId,s.id,res.locals.tokenHash);res.json(store.transaction(()=>project(g.patient,s.id,g.purpose,g.expiresAt)));
    }catch(e){next(e);}
  });
  router.post('/dispatch',(req,res,next)=>{
    try {
      const s=res.locals.staff as Staff,input=DispatchRequestSchema.parse(req.body);if(s.role!=='paramedic'||input.destination!=='hospital-demo')return unavailable();
      // Grant is checked even for an idempotent retry.
      const g=grant(input.grantId,s.id,res.locals.tokenHash);
      const result=store.mutate(s.id,input.requestId,input,()=>{
        const alert:Alert={id:randomUUID(),patientId:g.patient,destination:input.destination,unit:s.unit,etaMinutes:input.etaMinutes,timestamp:clock().toISOString(),status:'EN_ROUTE',revision:1,card:project(g.patient,s.id,'Dispatch: '+g.purpose,g.expiresAt)};
        store.put('alert',alert.id,alert);
        store.put('alert-release',alert.id,{revision:g.releaseRevision});
        return {id:alert.id};
      });notify();res.json(result);
    }catch(e){next(e);}
  });
  router.post('/alerts/read',(_req,res,next)=>{
    try{const s=res.locals.staff as Staff;if(s.facility!=='hospital-demo'||s.role!=='clinician')return unavailable();
      const result=store.transaction(()=>store.all<Alert>('alert').filter(a=>a.destination===s.facility).map(a=>{
        const p=profile(a.patientId);
        const scope=store.get<{revision:number}>('alert-release',a.id);
        if(!scope||scope.revision!==p.release.revision||p.release.revoked||Date.parse(a.card.expiresAt)<=clock().getTime())return {id:a.id,status:a.status,unavailable:true};
        return {...a,card:project(p.id,s.id,'Hospital dispatch review',a.card.expiresAt)};
      }));res.json(result);
    }catch(e){next(e);}
  });
  router.post('/alerts/:id/status',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,input=mutation.extend({status:z.enum(['ARRIVED','RESOLVED'])}).strict().parse(req.body),id=String(req.params.id);
      res.json(store.mutate(s.id,input.requestId,{id,...input},()=>{
        const a=store.get<Alert>('alert',id);if(!a||a.destination!==s.facility||s.role!=='clinician')return unavailable();
        if(a.revision!==input.expectedRevision||!(a.status==='EN_ROUTE'&&input.status==='ARRIVED'||a.status==='ARRIVED'&&input.status==='RESOLVED'))throw new Error('CONFLICT');
        a.status=input.status;a.revision++;store.put('alert',id,a);return {id,status:a.status,revision:a.revision};
      }));notify();
    }catch(e){next(e);}
  });
  router.get('/events',(req,res)=>{
    const s=res.locals.staff as Staff;
    if(s.facility!=='hospital-demo'&&s.role!=='paramedic'){res.status(403).end();return;}
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Connection','keep-alive');res.flushHeaders();
    // Notifications contain no patient data. Clients refetch via audited endpoints.
    const push=()=>res.write('event: refresh\ndata: {}\n\n');
    push();listeners.add(push);
    const heartbeat=setInterval(()=>res.write(': ping\n\n'),15000);
    // Bounded stream; EventSource reconnects and re-authenticates.
    const expiry=setTimeout(()=>res.end(),300000);
    req.on('close',()=>{listeners.delete(push);clearInterval(heartbeat);clearTimeout(expiry);});
  });
  router.post('/profiles/:id/book',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,pid=String(req.params.id),input=z.object({requestId:text,date:z.iso.date()}).strict().parse(req.body);if(!owner(s.id,pid))return unavailable();
      res.json(store.mutate(s.id,input.requestId,{pid,...input},()=>{const booking={id:randomUUID(),patientId:pid,date:input.date,status:'BOOKED',simulated:true,priceMinor:4250,currency:'USD'};store.put('booking',booking.id,booking);return booking;}));
    }catch(e){next(e);}
  });
  router.get('/ledger',(_req,res,next)=>{
    try{const s=res.locals.staff as Staff;if(s.facility!=='lab-demo')return unavailable();res.json(store.all<{facility:string}>('ledger').filter(l=>l.facility===s.facility));}catch(e){next(e);}
  });
  router.post('/profiles/:id/snapshot',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id),input=z.object({deviceId:text}).strict().parse(req.body);if(!owner(s.id,pid))return unavailable();
      res.json(store.transaction(()=>{
        const expiresAt=new Date(clock().getTime()+8*3600000).toISOString();
        const card=project(pid,s.id,'Prepare offline snapshot',expiresAt);
        const body={id:randomUUID(),deviceId:input.deviceId,actorId:s.id,createdAt:clock().toISOString(),expiresAt,releaseRevision:profile(pid).release.revision,card};
        const key=store.get<{privateKey:string;publicKey:string}>('key','facility')!;
        const snapshot={...body,signature:sign(null,Buffer.from(canonical(body)),key.privateKey).toString('base64'),publicKey:key.publicKey};
        store.put('snapshot',body.id,{...body,publicKey:key.publicKey});return snapshot;
      }));
    }catch(e){next(e);}
  });
  router.post('/offline/receipts',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,input=z.object({snapshotId:text,deviceId:text,sequence:z.number().int().positive(),at:z.iso.datetime()}).strict().parse(req.body);
      const snap=store.get<{actorId:string;deviceId:string;card:{patientId:string}}>('snapshot',input.snapshotId);
      if(!snap||snap.actorId!==s.id||snap.deviceId!==input.deviceId)return unavailable();
      res.json(store.mutate(s.id,'offline:'+input.deviceId+':'+input.sequence,input,()=>({receiptId:store.receipt(snap.card.patientId,s.id,'Offline snapshot opened',[],clock(),{deviceReportedAt:input.at,snapshotId:input.snapshotId})})));
    }catch(e){next(e);}
  });
  router.post('/readers/:id/revoke',(req,res,next)=>{
    try{const s=res.locals.staff as Staff;if(s.role!=='admin')return unavailable();const reader=store.get<Reader>('reader',String(req.params.id));if(!reader)return unavailable();reader.revoked=true;store.put('reader',reader.id,reader);res.json({revoked:true});}catch(e){next(e);}
  });
  router.use((error:unknown,_req:unknown,res:import('express').Response,_next:unknown)=>{
    const code=error instanceof z.ZodError?'INVALID_INPUT':error instanceof Error?error.message:'INTERNAL_ERROR';
    const known=['INVALID_INPUT','FORBIDDEN','CONFLICT','GRANT_EXPIRED','GRANT_REVOKED','SIGNATURE_INVALID'].includes(code);
    res.status(code==='FORBIDDEN'?404:code==='INVALID_INPUT'?400:known?409:503).json({error:{code:known?code:'AUDIT_UNAVAILABLE',message:known?code:'Unable to commit request.',retryable:!known},requestId:res.locals.requestId??randomUUID()});
  });
  return router;
}

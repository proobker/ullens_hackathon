import { Router } from 'express';
import { randomBytes, randomInt, randomUUID, sign } from 'node:crypto';
import { z } from 'zod';
import { CardSchema, DispatchRequestSchema, EntrySchema, GrantRequestSchema, HandwrittenUpdateSchema, PlatformProfileSchema, RegisterPatientSchema, ReleaseRequestSchema, ScanSchema, SignRequestSchema, type Alert } from '@pran-rekha/contracts/platform';
import { canonical, digest, freshness, NOTICE, PlatformStore, sixMonths, type Profile, type Staff } from './store.js';
import { hashPassword } from '../storage/seed.js';
import { intakeRouter } from './intake.js';
import { operationsRouter } from './operations.js';
import { medicationsRouter } from './medications.js';
import { lifecycle, type LifecycleEvent } from '@pran-rekha/domain';
import type { MedicationRecord } from '@pran-rekha/contracts';
type Grant = {id:string;actor:string;patient:string;deviceId:string;releaseRevision:number;expiresAt:string;purpose:string};
type Linkage = {id:string;actor:string;patient:string;expiresAt:string;rfid?:{deviceId:string;eventId:string}};
type Scan = {deviceId:string;tagUid:string;eventId:string;receivedAt:string};
type ReaderDisplay = {grantId:string;expiresAt:string};
type Face = {patientId:string;descriptor:number[];photo:string;photoSha256:string;createdBy:string;createdAt:string};
type HandwrittenSource = {id:string;patientId:string;image:string;sha256:string;ocrText:string;engine:string;actorId:string;at:string};
type Reader = {id:string;tokenHash:string;revoked:boolean;lastSeen:string|null};
const text=z.string().min(1).max(500);
const mutation=z.object({requestId:text,expectedRevision:z.number().int().nonnegative()});
const unavailable=()=>{throw new Error('FORBIDDEN');};
const hospitalStaff=(s:Staff)=>s.role==='clinician'&&s.facility==='hospital-demo';
const jpegBytes=(dataUrl:string)=>Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64');

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
  // Signs clinician-confirmed entries into a new profile version; callers run inside store.mutate.
  function commitSigned(s:Staff,pid:string,expectedRevision:number,entries:z.infer<typeof EntrySchema>[]) {
    const p=profile(pid);if(p.revision!==expectedRevision)throw new Error('CONFLICT');
    const version=store.signVersion({id:randomUUID(),patientId:pid,revision:p.revision+1,facility:s.facility,signer:s.id,signedAt:clock().toISOString(),reviewDue:sixMonths(clock()).toISOString(),entries});
    p.entries.push(...entries);p.versions.push(version);p.revision++;p.reviewDue=version.reviewDue;
    store.put('profile',pid,p);return version;
  }
  const signingClinician=(s:Staff,pid:string)=>s.role==='clinician'&&['lab-demo','hospital-demo'].includes(s.facility)&&allowedFull(s,pid);
  // Device endpoint accepts scan events only. It never returns linkage or records.
  router.post('/rfid/scans',(req,res,next)=>{
    try {
      const input=ScanSchema.parse(req.body), reader=store.get<Reader>('reader',input.deviceId);
      if(!reader||reader.revoked||digest(req.header('authorization')?.replace(/^Bearer /,'')??'')!==reader.tokenHash) return unavailable();
      const result=store.mutate('device:'+reader.id,input.eventId,input,()=>{
        reader.lastSeen=clock().toISOString();store.put('reader',reader.id,reader);
        store.put('scan',input.eventId,{...input,receivedAt:reader.lastSeen});
        store.put('reader-scan',reader.id,{eventId:input.eventId});
        return {accepted:true,eventId:input.eventId};
      });
      res.json(result);
    }catch(e){next(e);}
  });
  // A reader can display only its latest scan, after its paired staff member
  // authorizes that exact RFID linkage. A scan alone never discloses identity.
  router.get('/rfid/display',(req,res,next)=>{
    try {
      const input=z.object({deviceId:ScanSchema.shape.deviceId,eventId:ScanSchema.shape.eventId.optional()}).strict().parse(req.query);
      const reader=store.get<Reader>('reader',input.deviceId);
      if(!reader||reader.revoked||digest(req.header('authorization')?.replace(/^Bearer /,'')??'')!==reader.tokenHash)return unavailable();
      reader.lastSeen=clock().toISOString();store.put('reader',reader.id,reader);
      if(!input.eventId){res.json({state:'READY'});return;}
      const scan=store.get<Scan>('scan',input.eventId);
      const latest=store.get<{eventId:string}>('reader-scan',reader.id);
      if(!scan||scan.deviceId!==reader.id||latest?.eventId!==scan.eventId||Date.parse(scan.receivedAt)<=clock().getTime()-240000){res.json({state:'EXPIRED'});return;}
      const tag=store.get<{patientId:string;revoked:boolean}>('tag',scan.tagUid);
      if(!tag||tag.revoked){res.json({state:'UNKNOWN_TAG'});return;}
      const display=store.get<ReaderDisplay>('reader-display',reader.id+':'+scan.eventId);
      if(!display){res.json({state:Date.parse(scan.receivedAt)>clock().getTime()-120000?'WAITING_APPROVAL':'EXPIRED'});return;}
      const g=store.get<Grant>('grant',display.grantId);
      const binding=g&&store.get<{sessionHash:string}>('grant-session',g.id);
      const p=store.get<Profile>('profile',tag.patientId);
      if(!g||!p||g.patient!==tag.patientId||store.staff(g.actor)?.reader!==reader.id||!binding
        ||!store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND actor_id=? AND expires_at>?').get(binding.sessionHash,g.actor,clock().toISOString())
        ||Date.parse(display.expiresAt)<=clock().getTime()||Date.parse(g.expiresAt)<=clock().getTime()
        ||p.release.revoked||p.release.revision!==g.releaseRevision){res.json({state:'EXPIRED'});return;}
      const card=store.transaction(()=>project(g.patient,g.actor,'RFID LCD: '+g.purpose,display.expiresAt));
      res.json({state:'AUTHORIZED',expiresAt:display.expiresAt,card});
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
        const version=commitSigned(s,pid,input.expectedRevision,input.entries.map(e=>({...e,id:randomUUID(),author:s.id,reviewed:true})));
        store.put('ledger',version.id,{id:version.id,facility:s.facility,patientId:pid,amountMinor:5000,commissionMinor:400,currency:'USD',simulated:true,at:clock().toISOString()});
        return version;
      }));
    }catch(e){next(e);}
  });
  // Handwritten prescription/card: local OCR candidates confirmed line by line by the clinician, original image retained.
  router.post('/profiles/:id/handwritten',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id);
      if(!signingClinician(s,pid))return unavailable();
      const input=HandwrittenUpdateSchema.parse(req.body);
      if(jpegBytes(input.image).subarray(0,3).toString('hex')!=='ffd8ff')throw new Error('INVALID_INPUT');
      res.json(store.mutate(s.id,input.requestId,{pid,...input,image:digest(input.image)},()=>{
        const source:HandwrittenSource={id:randomUUID(),patientId:pid,image:input.image,sha256:digest(input.image),ocrText:input.ocrText,engine:input.engine,actorId:s.id,at:clock().toISOString()};
        const entries=input.entries.map(e=>EntrySchema.parse({id:randomUUID(),kind:e.kind,text:e.text,date:e.date,source:'Handwritten note · OCR candidate confirmed by clinician',excerpt:e.original.trim()||e.text,author:s.id,reviewed:true}));
        const version=commitSigned(s,pid,input.expectedRevision,entries);
        store.put('handwritten-source',source.id,source);
        for(const entry of entries)store.put('source-reference',entry.id,{handwrittenId:source.id,sha256:source.sha256,engine:source.engine,mode:'ocr_candidate_confirmed'});
        store.receipt(pid,s.id,'Handwritten note signed',entries.map(e=>e.id),clock());
        return {version,handwrittenId:source.id,entryIds:entries.map(e=>e.id)};
      }));
    }catch(e){next(e);}
  });
  router.get('/handwritten/:id/image',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,src=store.get<HandwrittenSource>('handwritten-source',String(req.params.id));
      if(!src||!(owner(s.id,src.patientId)||signingClinician(s,src.patientId)))return unavailable();
      res.set({'Content-Type':'image/jpeg','Cache-Control':'no-store'}).send(jpegBytes(src.image));
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
  // Hospital registration creates a synthetic record and a patient login; emergency release starts empty until the patient opts in.
  router.post('/patients',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;
      if(!hospitalStaff(s))return unavailable();
      const input=RegisterPatientSchema.parse(req.body);
      if(jpegBytes(input.photo).subarray(0,3).toString('hex')!=='ffd8ff')throw new Error('INVALID_INPUT');
      res.json(store.mutate(s.id,input.requestId,{...input,password:digest(input.password)},()=>{
        const actorId='portal-'+input.username;
        if(store.db.prepare('SELECT 1 FROM actors WHERE id=? OR username=?').get(actorId,input.username))throw new Error('CONFLICT');
        if(input.tagUid&&store.get('tag',input.tagUid))throw new Error('CONFLICT');
        let pid:string;
        do pid='PR-'+randomInt(1000,10000)+'-'+randomInt(1000,10000); while(store.get('profile',pid));
        const salt=randomBytes(16).toString('hex'),date=clock().toISOString().slice(0,10);
        store.db.prepare('INSERT INTO patients VALUES(?,?,?,?)').run(pid,input.name,null,'synthetic_fixture');
        store.db.prepare('INSERT INTO actors VALUES(?,?,?,?,?,?)').run(actorId,input.username,input.name,'patient',salt,hashPassword(input.password,salt));
        store.db.prepare('INSERT INTO portal_roles VALUES(?,?,?,?,?)').run(actorId,'patient','','','');
        store.db.prepare('INSERT INTO actor_patient_bindings VALUES(?,?)').run(actorId,pid);
        const source='Pran Rekha Demonstration Hospital · registration';
        const entries=([['blood_group',input.bloodGroup],['allergy',input.allergies]] as const).filter(([,text])=>text).map(([kind,text])=>EntrySchema.parse({id:randomUUID(),kind,text,date,source,excerpt:text,author:s.id,reviewed:true}));
        const reviewDue=sixMonths(clock()).toISOString();
        const versions=entries.length?[store.signVersion({id:randomUUID(),patientId:pid,revision:1,facility:s.facility,signer:s.id,signedAt:clock().toISOString(),reviewDue,entries})]:[];
        const locator='opaque-'+randomUUID();
        store.put('profile',pid,{id:pid,name:input.name,dob:input.dob,locator,revision:1,entries,versions,reviewDue,release:{revision:1,allowedEntryIds:[],revoked:false}} satisfies Profile);
        if(input.tagUid)store.put('tag',input.tagUid,{patientId:pid,revoked:false});
        // The registering clinician may update this patient's record (e.g. handwritten notes).
        store.put('assignment','hospital:'+pid,{actor:s.id,patient:pid});
        // Demo deviation from the session-only face rule: photo and descriptor persist in the demo database (hospital-only).
        store.put('face',pid,{patientId:pid,descriptor:input.descriptor,photo:input.photo,photoSha256:digest(input.photo),createdBy:s.id,createdAt:clock().toISOString()} satisfies Face);
        store.receipt(pid,s.id,'Hospital patient registration',[],clock());
        return {patientId:pid,name:input.name,locator,username:input.username};
      }));
    }catch(e){next(e);}
  });
  router.get('/faces',(_req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;if(!hospitalStaff(s))return unavailable();
      res.json(store.all<Face>('face').map(f=>({patientId:f.patientId,name:store.get<Profile>('profile',f.patientId)?.name??f.patientId,descriptor:f.descriptor})));
    }catch(e){next(e);}
  });
  router.get('/faces/:id/photo',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;if(!hospitalStaff(s))return unavailable();
      const face=store.get<Face>('face',String(req.params.id));if(!face)return unavailable();
      store.receipt(face.patientId,s.id,'Face photo viewed',[],clock());
      res.set({'Content-Type':'image/jpeg','Cache-Control':'no-store'}).send(jpegBytes(face.photo));
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
      const latest=store.get<{eventId:string}>('reader-scan',s.reader);
      const scan=latest?scans.find(e=>e.eventId===latest.eventId):scans[0];if(!scan){res.json({state:reader.lastSeen&&Date.parse(reader.lastSeen)>clock().getTime()-60000?'READY':'DISCONNECTED'});return;}
      const tag=store.get<{patientId:string;revoked:boolean}>('tag',scan.tagUid);
      if(!tag||tag.revoked){res.json({state:'UNKNOWN_TAG',eventId:scan.eventId});return;}
      const link:Linkage={id:randomUUID(),actor:s.id,patient:tag.patientId,expiresAt:new Date(clock().getTime()+120000).toISOString(),rfid:{deviceId:s.reader,eventId:scan.eventId}};
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
        if(link.rfid&&s.reader===link.rfid.deviceId){
          const scan=store.get<Scan>('scan',link.rfid.eventId);
          const latest=store.get<{eventId:string}>('reader-scan',s.reader);
          const tag=scan&&store.get<{patientId:string;revoked:boolean}>('tag',scan.tagUid);
          if(scan?.deviceId===s.reader&&latest?.eventId===scan.eventId&&tag?.patientId===p.id&&!tag.revoked&&Date.parse(scan.receivedAt)>clock().getTime()-120000){
            store.put('reader-display',s.reader+':'+scan.eventId,{grantId:g.id,expiresAt:new Date(clock().getTime()+90000).toISOString()} satisfies ReaderDisplay);
          }
        }
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

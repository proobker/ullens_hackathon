import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GrantRequestSchema, ScanSchema } from '@pran-rekha/contracts/platform';
import { digest, type PlatformStore, type Profile, type Staff } from './store.js';
const text=z.string().min(1).max(500);
type RequestRecord={id:string;actor:string;patient:string;deviceId:string;releaseRevision:number;purpose:string;status:string;expiresAt:string;grantId?:string};
export function operationsRouter(store:PlatformStore,clock:()=>Date){
  const router=Router();
  router.post('/readers/provision',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;if(s.role!=='admin')throw new Error('FORBIDDEN');
      const input=z.object({id:text,actorId:text}).strict().parse(req.body);
      const target=store.staff(input.actorId);if(!target||target.role!=='paramedic')throw new Error('INVALID_INPUT');
      const token=randomUUID()+randomUUID();
      store.transaction(()=>{store.put('reader',input.id,{id:input.id,tokenHash:digest(token),revoked:false,lastSeen:null});store.db.prepare('UPDATE portal_roles SET reader=? WHERE actor_id=?').run(input.id,target.id);});
      res.json({deviceId:input.id,token});
    }catch(e){next(e);}
  });
  router.post('/tags',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff;if(s.role!=='admin')throw new Error('FORBIDDEN');
      const input=z.object({tagUid:ScanSchema.shape.tagUid,patientId:text,revoked:z.boolean()}).strict().parse(req.body);
      if(!store.get('profile',input.patientId))throw new Error('FORBIDDEN');
      store.put('tag',input.tagUid,{patientId:input.patientId,revoked:input.revoked});res.json({updated:true});
    }catch(e){next(e);}
  });
  router.post('/break-glass',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,input=GrantRequestSchema.parse(req.body);
      if(!['clinician','paramedic'].includes(s.role))throw new Error('FORBIDDEN');
      const link=store.get<{actor:string;patient:string;expiresAt:string}>('link',input.linkageId);
      if(!link||link.actor!==s.id||link.patient!==input.patientId||Date.parse(link.expiresAt)<=clock().getTime())throw new Error('FORBIDDEN');
      const p=store.get<Profile>('profile',input.patientId);if(!p||p.release.revoked)throw new Error('GRANT_REVOKED');
      res.json(store.mutate(s.id,input.requestId,input,()=>{
        const pending:RequestRecord={id:randomUUID(),actor:s.id,patient:p.id,purpose:input.purpose,deviceId:input.deviceId,releaseRevision:p.release.revision,status:'PENDING',expiresAt:new Date(clock().getTime()+300000).toISOString()};
        store.put('break-glass',pending.id,pending);return pending;
      }));
    }catch(e){next(e);}
  });
  router.get('/break-glass',(_req,res,next)=>{
    try{const s=res.locals.staff as Staff;if(s.role!=='clinician'||s.facility!=='hospital-demo')throw new Error('FORBIDDEN');
      res.json(store.all<RequestRecord>('break-glass').filter(r=>r.status==='PENDING'&&r.actor!==s.id));
    }catch(e){next(e);}
  });
  router.post('/break-glass/:id/approve',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,input=z.object({requestId:text}).strict().parse(req.body),id=String(req.params.id);
      if(s.role!=='clinician'||s.facility!=='hospital-demo')throw new Error('FORBIDDEN');
      res.json(store.mutate(s.id,input.requestId,{id,...input},()=>{
        const b=store.get<RequestRecord>('break-glass',id);
        if(!b||b.actor===s.id)throw new Error('FORBIDDEN');
        if(b.status!=='PENDING'||Date.parse(b.expiresAt)<=clock().getTime())throw new Error('CONFLICT');
        const p=store.get<Profile>('profile',b.patient);if(!p||p.release.revoked||p.release.revision!==b.releaseRevision)throw new Error('GRANT_REVOKED');
        const g={id:randomUUID(),actor:b.actor,patient:b.patient,deviceId:b.deviceId,releaseRevision:b.releaseRevision,purpose:b.purpose,expiresAt:new Date(clock().getTime()+300000).toISOString()};
        store.put('grant',g.id,g);store.put('break-glass',id,{...b,status:'APPROVED',approvedBy:s.id,grantId:g.id});
        store.put('notification',id,{id,patientId:p.id,status:'PENDING',channel:'demo_outbox',at:clock().toISOString()});
        store.receipt(p.id,s.id,'Break-glass approval',[],clock(),{requester:b.actor});
        return {grantId:g.id,status:'APPROVED'};
      }));
    }catch(e){next(e);}
  });
  router.get('/break-glass/:id',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,b=store.get<RequestRecord>('break-glass',String(req.params.id));if(!b||b.actor!==s.id)throw new Error('FORBIDDEN');res.json(b);}catch(e){next(e);}
  });
  router.post('/offline/status',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,input=z.object({snapshotId:text}).strict().parse(req.body);
      const snapshot=store.get<{actorId:string;releaseRevision:number;card:{patientId:string}}>('snapshot',input.snapshotId);
      if(!snapshot||snapshot.actorId!==s.id)throw new Error('FORBIDDEN');
      const p=store.get<Profile>('profile',snapshot.card.patientId);
      res.json({revoked:!p||p.release.revoked||p.release.revision!==snapshot.releaseRevision});
    }catch(e){next(e);}
  });
  return router;
}

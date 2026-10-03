import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../storage/seed.js';
import { PlatformStore, sixMonths, type Profile } from './store.js';
import type { Entry } from '@pran-rekha/contracts/platform';

type Batch = {id:string;deviceId:string;status:string;cards:{order:number;tagUid:string;name:string;status:string;patientId?:string;username?:string}[]};
export type DemoLogin = {order:number;tagUid:string;name:string;patientId:string;username:string;password:string};

// Local operator workflow: a transaction activates a verified, named batch.
// Passwords are supplied by the CLI from a private file written BEFORE commit,
// so a crash cannot lose generated credentials. They never enter batch records.
export function enrollDemoBatch(store:PlatformStore,batchId:string,passwords:string[],clock=()=>new Date()):DemoLogin[]{
  return store.transaction(()=>{
    const batch=store.get<Batch>('rfid-enrollment-batch',batchId);
    if(!batch||!['NAMED','REGISTERED'].includes(batch.status)||batch.cards.length!==7||passwords.length!==7)throw new Error('Expected the named seven-card batch');
    if(new Set(batch.cards.map(c=>c.tagUid)).size!==7)throw new Error('Duplicate cards');
    const result:DemoLogin[]=[];
    const blood=['O+','A+','B+','AB+','O-','A-','B-'];
    const allergies=['No known allergies (fictional)','Penicillin rash (fictional)','Peanut allergy (fictional)','No known allergies (fictional)','Latex rash (fictional)','Dust sensitivity (fictional)','No known allergies (fictional)'];
    const conditions=['Mild asthma','Seasonal rhinitis','Migraine history','No chronic conditions recorded','Mild eczema','Hypothyroidism','Iron deficiency history'];
    for(const [i,card] of batch.cards.entries()){
      if(card.order!==i+1||!card.name?.trim()||passwords[i]!.length<12)throw new Error('Invalid enrollment data');
      const existing=store.get<{patientId:string}>('tag',card.tagUid);
      if(card.patientId){
        if(existing?.patientId!==card.patientId||!store.get<Profile>('profile',card.patientId)?.demo||!card.username)throw new Error('Existing enrollment changed; refusing overwrite');
        result.push({order:card.order,tagUid:card.tagUid,name:card.name,patientId:card.patientId,username:card.username,password:passwords[i]!});continue;
      }
      if(existing)throw new Error('Card already assigned; refusing overwrite');
      const username='demo-rfid-'+card.tagUid.toLowerCase(),actorId='portal-'+username;
      if(store.db.prepare('SELECT 1 FROM actors WHERE username=? OR id=?').get(username,actorId))throw new Error('Username already exists');
      const pid='PR-DEMO-'+randomUUID(),now=clock(),date=now.toISOString().slice(0,10),reviewDue=sixMonths(now).toISOString();
      const values:[Entry['kind'],string][]=[['blood_group',blood[i]!],['allergy',allergies[i]!],['condition',conditions[i]!],['vital',`BP ${110+i*2}/${70+i} mmHg; pulse ${68+i*2} bpm`]];
      const entries:Entry[]=values.map(([kind,value])=>({id:randomUUID(),kind,text:'DEMO: '+value,date,source:'FICTIONAL DEMO - generated sample, not verified medical history',excerpt:'FICTIONAL SAMPLE: '+value,author:'demo-fixture-generator',reviewed:false}));
      const version=store.signVersion({id:randomUUID(),patientId:pid,revision:1,facility:'hospital-demo',signer:'Demo fixture generator (not a clinician)',signedAt:now.toISOString(),reviewDue,entries});
      const p:Profile={id:pid,name:card.name,demo:true,dob:`${1990+i}-01-15`,locator:'opaque-'+randomUUID(),revision:1,entries,versions:[version],reviewDue,release:{revision:1,allowedEntryIds:entries.map(e=>e.id),revoked:false}};
      const salt=randomBytes(16).toString('hex');
      store.db.prepare('INSERT INTO patients VALUES(?,?,?,?)').run(pid,card.name,null,'synthetic_fixture');
      store.db.prepare('INSERT INTO actors VALUES(?,?,?,?,?,?)').run(actorId,username,card.name,'patient',salt,hashPassword(passwords[i]!,salt));
      store.db.prepare('INSERT INTO portal_roles VALUES(?,?,?,?,?)').run(actorId,'patient','','','');
      store.db.prepare('INSERT INTO actor_patient_bindings VALUES(?,?)').run(actorId,pid);
      store.put('profile',pid,p);
      store.put('tag',card.tagUid,{patientId:pid,revoked:false});
      store.put('assignment','hospital:'+pid,{actor:'portal-hospital',patient:pid});
      store.put('demo-name-display',card.tagUid,{patientId:pid,deviceId:batch.deviceId,batchId});
      store.receipt(pid,'portal-hospital','Operator-authorized fictional RFID demo registration',entries.map(e=>e.id),now,{batchId,fictional:true});
      card.patientId=pid;card.username=username;card.status='REGISTERED';
      result.push({order:card.order,tagUid:card.tagUid,name:card.name,patientId:pid,username,password:passwords[i]!});
    }
    batch.status='REGISTERED';store.put('rfid-enrollment-batch',batchId,batch);return result;
  });
}

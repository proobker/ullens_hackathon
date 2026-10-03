import type { DatabaseSync } from 'node:sqlite';
import { createHash, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import type { ClinicalVersion, Entry } from '@pran-rekha/contracts/platform';
import { hashPassword } from '../storage/seed.js';

export type Staff = { id: string; role: string; facility: string; unit: string; reader: string };
export type Profile = {
  demo?: true;
  id: string; name: string; dob: string; locator: string; revision: number; entries: Entry[];
  versions: ClinicalVersion[]; reviewDue: string;
  release: { revision: number; allowedEntryIds: string[]; revoked: boolean };
};
export const NOTICE = 'This summary may be incomplete. Information outside the selected emergency scope is not shown.';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
};
export function sixMonths(value: Date): Date {
  const date = new Date(value); const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+6);
  const last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last)); return date;
}
export function freshness(reviewDue: string, now: Date) {
  const remaining = Date.parse(reviewDue)-now.getTime();
  return remaining <= 0 ? 'EXPIRED' as const : remaining <= 30*86400000 ? 'AGING' as const : 'FRESH' as const;
}
export class PlatformStore {
  constructor(readonly db: DatabaseSync) {
    db.exec('CREATE TABLE IF NOT EXISTS platform_migrations(version INTEGER PRIMARY KEY);'
      +'CREATE TABLE IF NOT EXISTS platform_objects(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));'
      +'CREATE TABLE IF NOT EXISTS platform_receipts(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,body TEXT NOT NULL);'
      +'CREATE TABLE IF NOT EXISTS portal_roles(actor_id TEXT PRIMARY KEY,role TEXT NOT NULL,facility TEXT NOT NULL,unit TEXT NOT NULL,reader TEXT NOT NULL);'
      +'CREATE TABLE IF NOT EXISTS platform_requests(actor_id TEXT NOT NULL,request_id TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor_id,request_id));'
      +'INSERT OR IGNORE INTO platform_migrations VALUES(1);');
  }
  get<T>(kind: string,id: string): T | undefined {
    const row = this.db.prepare('SELECT body FROM platform_objects WHERE kind=? AND id=?').get(kind,id) as {body:string}|undefined;
    return row ? JSON.parse(row.body) as T : undefined;
  }
  all<T>(kind:string): T[] {
    return (this.db.prepare('SELECT body FROM platform_objects WHERE kind=? ORDER BY id').all(kind) as {body:string}[]).map(r=>JSON.parse(r.body) as T);
  }
  put(kind:string,id:string,value:unknown) {
    this.db.prepare('INSERT INTO platform_objects VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind,id,JSON.stringify(value));
  }
  staff(id:string): Staff | undefined {
    return this.db.prepare('SELECT actor_id AS id,role,facility,unit,reader FROM portal_roles WHERE actor_id=?').get(id) as Staff|undefined;
  }
  transaction<T>(run:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=run(); this.db.exec('COMMIT'); return result; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  mutate<T>(actor:string,requestId:string,payload:unknown,run:()=>T):T {
    return this.transaction(()=>{
      const hash=digest(canonical(payload));
      const old=this.db.prepare('SELECT hash,result FROM platform_requests WHERE actor_id=? AND request_id=?').get(actor,requestId) as {hash:string;result:string}|undefined;
      if(old) { if(old.hash!==hash) throw new Error('CONFLICT'); return JSON.parse(old.result) as T; }
      const result=run();
      this.db.prepare('INSERT INTO platform_requests VALUES(?,?,?,?)').run(actor,requestId,hash,JSON.stringify(result));
      return result;
    });
  }
  receipt(patient:string,actor:string,purpose:string,resources:string[],now:Date,extra:Record<string,unknown>={}) {
    const receipt={id:randomUUID(),patientId:patient,actorId:actor,purpose,resources,at:now.toISOString(),...extra};
    this.db.prepare('INSERT INTO platform_receipts VALUES(?,?,?,?)').run(receipt.id,patient,actor,JSON.stringify(receipt));
    return receipt.id;
  }
  signVersion(data: Omit<ClinicalVersion,'signature'|'publicKey'>):ClinicalVersion {
    const key=this.get<{privateKey:string;publicKey:string}>('key','facility')!;
    return {...data,publicKey:key.publicKey,signature:sign(null,Buffer.from(canonical(data)),key.privateKey).toString('base64')};
  }
  verifyVersion(version:ClinicalVersion) {
    const {signature,publicKey,...body}=version;
    const trusted=this.get<{publicKey:string}>('key','facility')!;
    return publicKey===trusted.publicKey && verify(null,Buffer.from(canonical(body)),trusted.publicKey,Buffer.from(signature,'base64'));
  }
  verifyProfile(profile:Profile) {
    if(profile.versions.some(v=>!this.verifyVersion(v)))return false;
    return profile.entries.filter(e=>e.reviewed).every(entry=>profile.versions.some(v=>v.entries.some(signed=>canonical(signed)===canonical(entry))));
  }
  seed() {
    if(this.get('profile','PR-9042-8819')) return;
    const keys=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    this.put('key','facility',keys);
    const accounts=[
      ['siddharth','patient','patient','',''],['paramedic','paramedic','field','UNIT-DEMO-01','reader-demo'],
      ['lab','clinician','lab-demo','',''],['hospital','clinician','hospital-demo','',''],
      ['approver','clinician','hospital-demo','',''],['admin','admin','admin','','']
    ];
    for(const [name,role,facility,unit,reader] of accounts) {
      const actorId='portal-'+name; const salt='synthetic-'+name;
      this.db.prepare('INSERT OR IGNORE INTO actors VALUES(?,?,?,?,?,?)').run(actorId,name!,name!+' · synthetic',role==='paramedic'?'clinician':role!,salt,hashPassword('pran-demo-'+name,salt));
      this.db.prepare('INSERT OR REPLACE INTO portal_roles VALUES(?,?,?,?,?)').run(actorId,role!,facility!,unit!,reader!);
    }
    const patientId='PR-9042-8819';
    this.db.prepare('INSERT OR IGNORE INTO patients VALUES(?,?,?,?)').run(patientId,'Siddharth Raj Sharma',null,'synthetic_fixture');
    this.db.prepare('INSERT OR IGNORE INTO actor_patient_bindings VALUES(?,?)').run('portal-siddharth',patientId);
    this.put('assignment','lab-demo',{actor:'portal-lab',patient:patientId});
    const entries:Entry[]=[
      ['blood','blood_group','O-'],['allergy','allergy','Penicillin — anaphylaxis recorded'],['donor','donor','Organ donor: yes, recorded in synthetic fixture'],
      ['bp','vital','Blood pressure 118/78 mmHg'],['hr','vital','Resting heart rate 71 bpm'],
      ['private','condition','Excluded demonstration condition']
    ].map(([id,kind,text])=>({id:id!,kind:kind as Entry['kind'],text:text!,date:'2026-08-20',source:'National Reference Laboratory · fictional fixture',excerpt:text!,author:'portal-lab',reviewed:true}));
    const version=this.signVersion({id:'initial-version',patientId,revision:1,facility:'lab-demo',signer:'Dr. Aruna Shrestha · fictional',signedAt:'2026-08-20T04:30:00.000Z',reviewDue:'2027-02-20T04:30:00.000Z',entries});
    this.put('profile',patientId,{id:patientId,name:'Siddharth Raj Sharma',dob:'1994-08-14',locator:'demo-opaque-93e74fd4-54c5-45cf-9760-54d64f20e347',revision:1,entries,versions:[version],reviewDue:version.reviewDue,release:{revision:1,allowedEntryIds:entries.filter(e=>e.id!=='private').map(e=>e.id),revoked:false}} satisfies Profile);
    this.put('reader','reader-demo',{id:'reader-demo',tokenHash:digest('synthetic-reader-secret-change-before-hardware'),revoked:false,lastSeen:null});
    this.put('tag','DEADBEEF',{patientId,revoked:false});
  }
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { openDatabase } from '../server/src/storage/database';
import { seedDatabase } from '../server/src/storage/seed';
import { createApp } from '../server/src/app';
import { PlatformStore, type Profile, sixMonths } from '../server/src/platform/store';
describe('combined platform',()=>{
  let dir:string,db:ReturnType<typeof openDatabase>,app:ReturnType<typeof createApp>,store:PlatformStore;
  let now=new Date('2026-10-03T04:30:00.000Z');
  const pid='PR-9042-8819',base='/api/platform';
  beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'pran-platform-'));db=openDatabase({databasePath:join(dir,'db.sqlite')});seedDatabase(db,resolve('fixtures/documents'));now=new Date('2026-10-03T04:30:00.000Z');app=createApp({database:db,clock:()=>now,secureCookies:false});store=new PlatformStore(db);});
  afterEach(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  async function actor(name:string){const a=request.agent(app);expect((await a.post('/api/session').send({username:name,password:'pran-demo-'+name})).status).toBe(201);return a;}
  async function access(){
    const a=await actor('paramedic'),p=store.get<Profile>('profile',pid)!;
    const link=await a.post(base+'/linkage').send({locator:p.locator});
    const grant=await a.post(base+'/grants').send({requestId:crypto.randomUUID(),...link.body,deviceId:'test',purpose:'Emergency demonstration',confirmed:true});
    expect(grant.status).toBe(200);return {a,grant:grant.body};
  }
  it('lab → patient release → paramedic dispatch → destination hospital → receipt',async()=>{
    const lab=await actor('lab'),patient=await actor('siddharth');
    const signed=await lab.post(base+'/profiles/'+pid+'/sign').send({requestId:'sign-1',expectedRevision:1,entries:[{kind:'vital',text:'BP 120/80 mmHg',date:'2026-10-03',source:'Demo attestation',excerpt:'BP 120/80 mmHg'}]});
    expect(signed.status).toBe(200);expect(store.verifyVersion(signed.body)).toBe(true);
    const p=await patient.get(base+'/profiles/'+pid);expect(p.status).toBe(200);
    const ids=p.body.entries.filter((e:{id:string})=>e.id!=='private').map((e:{id:string})=>e.id);
    expect((await patient.post(base+'/profiles/'+pid+'/release').send({requestId:'release-1',expectedRevision:2,allowedEntryIds:ids})).status).toBe(200);
    const {a,grant}=await access();
    const card=await a.post(base+'/cards').send({grantId:grant.id});expect(card.status).toBe(200);expect(JSON.stringify(card.body)).not.toContain('Excluded');
    const payload={requestId:'dispatch-1',grantId:grant.id,destination:'hospital-demo',etaMinutes:12};
    const first=await a.post(base+'/dispatch').send(payload),second=await a.post(base+'/dispatch').send(payload);
    expect(first.body).toEqual(second.body);expect(store.all('alert')).toHaveLength(1);
    const hospital=await actor('hospital');const alerts=await hospital.post(base+'/alerts/read').send({});
    expect(alerts.status).toBe(200);expect(alerts.body[0].card.entries.some((e:{text:string})=>e.text==='BP 120/80 mmHg')).toBe(true);
    expect((await patient.get(base+'/profiles/'+pid+'/receipts')).body.length).toBeGreaterThan(1);
  });
  it('denies role forgery, patient signing, unassigned lab and wrong destination reads',async()=>{
    const p=await actor('siddharth');
    expect((await p.post(base+'/profiles/'+pid+'/sign').send({requestId:'x',expectedRevision:1,entries:[]})).status).toBe(400);
    expect((await p.post(base+'/alerts/read').send({})).status).toBe(404);
    const lab=await actor('lab');expect((await lab.get(base+'/profiles/patient_maya_001')).status).toBe(404);
    expect((await p.post('/api/session').send({username:'lab',password:'pran-demo-lab',role:'admin'})).status).toBe(400);
  });
  it('reader accepts only authenticated, deduplicated scans with no clinical payload',async()=>{
    const payload={version:1,deviceId:'reader-demo',eventId:'scan-1',tagUid:'deadbeef'};
    expect((await request(app).post(base+'/rfid/scans').send(payload)).status).toBe(404);
    for(let i=0;i<2;i++){const result=await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send(payload);expect(result.body).toEqual({accepted:true,eventId:'scan-1'});}
    expect(store.all('scan')).toHaveLength(1);
    const a=await actor('paramedic');expect((await a.get(base+'/rfid/pending')).body.state).toBe('CANDIDATE');
    store.put('reader','reader-demo',{id:'reader-demo',revoked:true,tokenHash:''});
    expect((await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send(payload)).status).toBe(404);
  });
  it('rejects revoked and expired grants, and fails closed when audit cannot commit',async()=>{
    const {a,grant}=await access();
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON platform_receipts BEGIN SELECT RAISE(ABORT,'audit failure'); END;");
    const denied=await a.post(base+'/cards').send({grantId:grant.id});expect(denied.status).toBe(503);expect(denied.body.entries).toBeUndefined();
    db.exec('DROP TRIGGER fail_receipt');
    now=new Date(now.getTime()+600001);
    expect((await a.post(base+'/cards').send({grantId:grant.id})).body.error.code).toBe('GRANT_EXPIRED');
    const next=await access();const p=store.get<Profile>('profile',pid)!;p.release.revoked=true;store.put('profile',pid,p);
    expect((await next.a.post(base+'/cards').send({grantId:next.grant.id})).body.error.code).toBe('GRANT_REVOKED');
  });
  it('does not expand an existing hospital dispatch when the patient changes the release',async()=>{
    const {a,grant}=await access();
    expect((await a.post(base+'/dispatch').send({requestId:'scope-dispatch',grantId:grant.id,destination:'hospital-demo',etaMinutes:5})).status).toBe(200);
    const patient=await actor('siddharth');
    const profile=await patient.get(base+'/profiles/'+pid);
    expect((await patient.post(base+'/profiles/'+pid+'/release').send({requestId:'changed-release',expectedRevision:profile.body.revision,allowedEntryIds:profile.body.entries.map((e:{id:string})=>e.id)})).status).toBe(200);
    const hospital=await actor('hospital');
    const alerts=await hospital.post(base+'/alerts/read').send({});
    expect(alerts.status).toBe(200);
    expect(alerts.body[0].unavailable).toBe(true);
    expect(alerts.body[0].card).toBeUndefined();
  });
  it('binds emergency grants to the requesting login session',async()=>{
    const {a,grant}=await access();
    const otherSession=await actor('paramedic');
    expect((await otherSession.post(base+'/cards').send({grantId:grant.id})).status).toBe(404);
    expect((await otherSession.post(base+'/dispatch').send({requestId:'stolen-grant',grantId:grant.id,destination:'hospital-demo',etaMinutes:5})).status).toBe(404);
    expect((await a.post(base+'/cards').send({grantId:grant.id})).status).toBe(200);
  });
  it('detects signed record tampering',async()=>{
    const p=store.get<Profile>('profile',pid)!;p.versions[0]!.entries[0]!.text='tampered';store.put('profile',pid,p);
    const patient=await actor('siddharth');expect((await patient.get(base+'/profiles/'+pid)).body.error.code).toBe('SIGNATURE_INVALID');
  });
  it('rejects cross-origin mutations and preserves calendar month boundaries',async()=>{
    expect((await request(app).post('/api/session').set('Origin','https://attacker.test').send({username:'lab',password:'pran-demo-lab'})).status).toBe(403);
    expect(sixMonths(new Date('2026-08-31T00:00:00Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});

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
  const face={photo:'data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,0,0x10]).toString('base64'),descriptor:Array.from({length:128},(_,i)=>i/1000)};
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
  async function rfidAccess(eventId='lcd-scan') {
    now=new Date(now.getTime()+1);
    const a=await actor('paramedic');
    await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send({version:1,deviceId:'reader-demo',eventId,tagUid:'DEADBEEF'});
    const link=(await a.get(base+'/rfid/pending')).body;
    const result=await a.post(base+'/grants').send({requestId:crypto.randomUUID(),patientId:link.patientId,linkageId:link.linkageId,deviceId:'staff-browser',purpose:'RFID emergency summary',confirmed:true});
    expect(result.status).toBe(200);
    return a;
  }
  const lcd=(eventId='lcd-scan')=>request(app).get(base+'/rfid/display').query({deviceId:'reader-demo',eventId}).set('Authorization','Bearer synthetic-reader-secret-change-before-hardware');
  it('shows only approved scope on the LCD and clears it after 90 seconds',async()=>{
    const payload={version:1,deviceId:'reader-demo',eventId:'lcd-scan',tagUid:'DEADBEEF'};
    await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send(payload);
    expect((await lcd()).body).toEqual({state:'WAITING_APPROVAL'});
    expect((await request(app).get(base+'/rfid/display').query({deviceId:'reader-demo',eventId:'lcd-scan'})).status).toBe(404);
    await rfidAccess();
    const result=await lcd();
    expect(result.body.state).toBe('AUTHORIZED');
    expect(result.body.card.name).toBe('Siddharth Raj Sharma');
    expect(JSON.stringify(result.body)).not.toContain('Excluded');
    now=new Date(now.getTime()+90001);
    expect((await lcd()).body).toEqual({state:'EXPIRED'});
  });
  it('never reuses a prior card authorization for a new scan',async()=>{
    await rfidAccess();
    now=new Date(now.getTime()+1);
    const payload={version:1,deviceId:'reader-demo',eventId:'next-card',tagUid:'DEADBEEF'};
    await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send(payload);
    expect((await lcd()).body).toEqual({state:'EXPIRED'});
    expect((await lcd('next-card')).body).toEqual({state:'WAITING_APPROVAL'});
    // A retry of the old scan must not become the latest scan again.
    await request(app).post(base+'/rfid/scans').set('Authorization','Bearer synthetic-reader-secret-change-before-hardware').send({version:1,deviceId:'reader-demo',eventId:'lcd-scan',tagUid:'DEADBEEF'});
    expect((await lcd()).body).toEqual({state:'EXPIRED'});
  });
  it('clears the LCD when staff logs out or the release changes',async()=>{
    const a=await rfidAccess();
    await a.delete('/api/session');
    expect((await lcd()).body).toEqual({state:'EXPIRED'});
    await rfidAccess('new-session');
    const p=store.get<Profile>('profile',pid)!;
    p.release.revision++;store.put('profile',pid,p);
    expect((await lcd('new-session')).body).toEqual({state:'EXPIRED'});
  });
  it('fails closed for tag revocation, invalid signatures and failed LCD auditing',async()=>{
    await rfidAccess();
    db.exec("CREATE TRIGGER fail_lcd_receipt BEFORE INSERT ON platform_receipts BEGIN SELECT RAISE(ABORT,'audit failure'); END;");
    expect((await lcd()).status).toBe(503);
    db.exec('DROP TRIGGER fail_lcd_receipt');
    const p=store.get<Profile>('profile',pid)!;p.versions[0]!.entries[0]!.text='tampered';store.put('profile',pid,p);
    expect((await lcd()).body.error.code).toBe('SIGNATURE_INVALID');
    store.put('tag','DEADBEEF',{patientId:pid,revoked:true});
    expect((await lcd()).body).toEqual({state:'UNKNOWN_TAG'});
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
  it('requires a distinct approver and limits break-glass access to five minutes',async()=>{
    const requester=await actor('hospital');
    const patient=await actor('siddharth');
    const profile=await patient.get(base+'/profiles/'+pid);
    const link=await requester.post(base+'/linkage').send({locator:profile.body.locator});
    const pending=await requester.post(base+'/break-glass').send({requestId:'break-1',...link.body,deviceId:'review-browser',purpose:'Synthetic emergency review',confirmed:true});
    expect(pending.status).toBe(200);
    expect((await requester.post(base+'/break-glass/'+pending.body.id+'/approve').send({requestId:'self-approval'})).status).toBe(404);
    const approver=await actor('approver');
    const approved=await approver.post(base+'/break-glass/'+pending.body.id+'/approve').send({requestId:'independent-approval'});
    expect(approved.status).toBe(200);
    expect((await requester.post(base+'/cards').send({grantId:approved.body.grantId})).status).toBe(200);
    now=new Date(now.getTime()+300001);
    expect((await requester.post(base+'/cards').send({grantId:approved.body.grantId})).body.error.code).toBe('GRANT_EXPIRED');
    expect((await patient.get(base+'/profiles/'+pid+'/receipts')).body.some((r:{purpose:string})=>r.purpose==='Break-glass approval')).toBe(true);
  });
  it('keeps imported originals private and attributes manual source confirmation',async()=>{
    const patient=await actor('siddharth'),other=await actor('lab');
    const payload={requestId:'intake-1',title:'Synthetic pixel source',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII='};
    const uploaded=await patient.post(base+'/profiles/'+pid+'/documents').send(payload);
    expect(uploaded.status).toBe(200);
    expect((await patient.post(base+'/profiles/'+pid+'/documents').send({...payload,requestId:'intake-duplicate'})).body).toMatchObject({id:uploaded.body.id,duplicate:true});
    expect((await other.get(base+'/documents/'+uploaded.body.id+'/original')).status).toBe(404);
    expect((await other.get(base+'/documents/absent/original')).status).toBe(404);
    expect((await patient.get(base+'/documents/'+uploaded.body.id+'/original')).status).toBe(200);
    const p=await patient.get(base+'/profiles/'+pid);
    const confirmation={requestId:'confirm-1',expectedRevision:p.body.revision,page:1,start:0,end:0,text:'Synthetic handwritten patient note',date:'2026-10-03',kind:'report'};
    const confirmed=await patient.post(base+'/documents/'+uploaded.body.id+'/confirm').send(confirmation);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({reviewed:false,excerpt:'Synthetic handwritten patient note',author:'portal-siddharth'});
    expect((await patient.post(base+'/documents/'+uploaded.body.id+'/confirm').send({...confirmation,requestId:'stale-confirm'})).status).toBe(409);
  });
  it('detects signed record tampering',async()=>{
    const p=store.get<Profile>('profile',pid)!;p.versions[0]!.entries[0]!.text='tampered';store.put('profile',pid,p);
    const patient=await actor('siddharth');expect((await patient.get(base+'/profiles/'+pid)).body.error.code).toBe('SIGNATURE_INVALID');
  });
  it('hospital registers a patient with a signed record, login and locator; release starts empty',async()=>{
    const hospital=await actor('hospital');
    const body={requestId:'reg-1',name:'Asha Gurung',dob:'1990-01-15',bloodGroup:'B+',allergies:'Latex — rash recorded',tagUid:'cafe1234',username:'asha',password:'synthetic-pass-1',...face};
    const reg=await hospital.post(base+'/patients').send(body);
    expect(reg.status).toBe(200);expect(reg.body).toEqual({patientId:expect.stringMatching(/^PR-\d{4}-\d{4}$/),name:'Asha Gurung',locator:expect.stringMatching(/^opaque-/),username:'asha'});
    expect(JSON.stringify(reg.body)).not.toContain('synthetic-pass-1');
    expect((await hospital.post(base+'/patients').send(body)).body).toEqual(reg.body);
    const patient=request.agent(app);expect((await patient.post('/api/session').send({username:'asha',password:'synthetic-pass-1'})).status).toBe(201);
    expect((await patient.get(base+'/context')).body.patients).toEqual([{id:reg.body.patientId,name:'Asha Gurung'}]);
    const profile=await patient.get(base+'/profiles/'+reg.body.patientId);
    expect(profile.status).toBe(200);expect(profile.body.entries.map((e:{kind:string;text:string})=>e.kind+':'+e.text)).toEqual(['blood_group:B+','allergy:Latex — rash recorded']);
    expect(profile.body.release.allowedEntryIds).toEqual([]);expect(store.get('tag','CAFE1234')).toEqual({patientId:reg.body.patientId,revoked:false});
    const medic=await actor('paramedic');
    const link=await medic.post(base+'/linkage').send({locator:reg.body.locator});expect(link.body.patientId).toBe(reg.body.patientId);
    const grant=await medic.post(base+'/grants').send({requestId:'g-reg',...link.body,deviceId:'test',purpose:'Emergency demonstration',confirmed:true});
    expect((await medic.post(base+'/cards').send({grantId:grant.body.id})).body.entries).toEqual([]);
  });
  it('limits registration to hospital staff and rejects duplicate usernames or tags',async()=>{
    const body=(n:string,extra={})=>({requestId:'reg-'+n,name:'Synthetic '+n,dob:'1990-01-15',username:'user'+n,password:'synthetic-pass-1',...face,...extra});
    for(const name of ['paramedic','lab','siddharth'])expect((await (await actor(name)).post(base+'/patients').send(body(name))).status).toBe(404);
    const hospital=await actor('hospital');
    expect((await hospital.post(base+'/patients').send(body('a',{username:'siddharth'}))).status).toBe(409);
    expect((await hospital.post(base+'/patients').send(body('b',{tagUid:'DEADBEEF'}))).status).toBe(409);
    expect((await hospital.post(base+'/patients').send(body('c',{password:'short'}))).status).toBe(400);
    const plain=await hospital.post(base+'/patients').send(body('d'));expect(plain.status).toBe(200);
    expect(store.verifyProfile(store.get<Profile>('profile',plain.body.patientId)!)).toBe(true);
  });
  it('requires a JPEG face photo at registration and serves the saved face to hospital staff only',async()=>{
    const hospital=await actor('hospital');
    const body={requestId:'reg-face',name:'Face Test',dob:'1990-01-15',username:'facetest',password:'synthetic-pass-1',...face};
    const {photo:_photo,...noPhoto}=body;
    expect((await hospital.post(base+'/patients').send({...noPhoto,requestId:'reg-nophoto'})).status).toBe(400);
    expect((await hospital.post(base+'/patients').send({...body,requestId:'reg-png',photo:'data:image/jpeg;base64,'+Buffer.from('not a jpeg').toString('base64')})).status).toBe(400);
    expect((await hospital.post(base+'/patients').send({...body,requestId:'reg-short',descriptor:[1,2,3]})).status).toBe(400);
    const reg=await hospital.post(base+'/patients').send(body);expect(reg.status).toBe(200);
    const gallery=await hospital.get(base+'/faces');
    expect(gallery.body).toEqual([{patientId:reg.body.patientId,name:'Face Test',descriptor:face.descriptor}]);
    const photo=await hospital.get(base+'/faces/'+reg.body.patientId+'/photo');
    expect(photo.status).toBe(200);expect(photo.headers['content-type']).toBe('image/jpeg');expect(photo.headers['cache-control']).toBe('no-store');
    expect((db.prepare('SELECT body FROM platform_receipts WHERE patient_id=?').all(reg.body.patientId) as {body:string}[]).map(r=>JSON.parse(r.body).purpose)).toContain('Face photo viewed');
    for(const name of ['paramedic','lab','siddharth']){
      const a=await actor(name);
      expect((await a.get(base+'/faces')).status).toBe(404);expect((await a.get(base+'/faces/'+reg.body.patientId+'/photo')).status).toBe(404);
    }
  });
  it('signs clinician-confirmed handwritten OCR entries and keeps the original image',async()=>{
    const lab=await actor('lab'),patient=await actor('siddharth');
    const note={image:face.photo,ocrText:'Tab Amoxici11in 500mg BD\nAllergy: Penici1lin',engine:'tesseract.js@test/eng',entries:[
      {kind:'medication',text:'Tab Amoxicillin 500mg BD',original:'Tab Amoxici11in 500mg BD',date:'2026-10-03'},
      {kind:'allergy',text:'Allergy: Penicillin',original:'Allergy: Penici1lin',date:'2026-10-03'}]};
    const revision=store.get<Profile>('profile',pid)!.revision;
    expect((await lab.post(base+'/profiles/'+pid+'/handwritten').send({...note,requestId:'hw-stale',expectedRevision:revision+5})).status).toBe(409);
    expect((await lab.post(base+'/profiles/'+pid+'/handwritten').send({...note,requestId:'hw-png',expectedRevision:revision,image:'data:image/jpeg;base64,'+Buffer.from('png?').toString('base64')})).status).toBe(400);
    const signed=await lab.post(base+'/profiles/'+pid+'/handwritten').send({...note,requestId:'hw-1',expectedRevision:revision});
    expect(signed.status).toBe(200);expect(store.verifyVersion(signed.body.version)).toBe(true);
    const p=store.get<Profile>('profile',pid)!;expect(store.verifyProfile(p)).toBe(true);
    const added=p.entries.filter(e=>signed.body.entryIds.includes(e.id));
    expect(added.map(e=>[e.kind,e.text,e.excerpt,e.reviewed])).toEqual([['medication','Tab Amoxicillin 500mg BD','Tab Amoxici11in 500mg BD',true],['allergy','Allergy: Penicillin','Allergy: Penici1lin',true]]);
    for(const a of [lab,patient]){const img=await a.get(base+'/handwritten/'+signed.body.handwrittenId+'/image');expect(img.status).toBe(200);expect(img.headers['content-type']).toBe('image/jpeg');}
    for(const name of ['paramedic','hospital']){
      const a=await actor(name);
      expect((await a.post(base+'/profiles/'+pid+'/handwritten').send({...note,requestId:'hw-'+name,expectedRevision:p.revision})).status).toBe(404);
      expect((await a.get(base+'/handwritten/'+signed.body.handwrittenId+'/image')).status).toBe(404);
    }
    expect((await patient.post(base+'/profiles/'+pid+'/handwritten').send({...note,requestId:'hw-patient',expectedRevision:p.revision})).status).toBe(404);
  });
  it('lets the registering hospital clinician sign handwritten notes for that patient only',async()=>{
    const hospital=await actor('hospital');
    const reg=await hospital.post(base+'/patients').send({requestId:'reg-hw',name:'Handwritten Test',dob:'1990-01-15',username:'hwtest',password:'synthetic-pass-1',...face});
    const note={requestId:'hw-hosp',expectedRevision:1,image:face.photo,ocrText:'BP 130/85 mmHg',engine:'tesseract.js@test/eng',entries:[{kind:'vital',text:'BP 130/85 mmHg',original:'BP 130/85 mmHg',date:'2026-10-03'}]};
    expect((await hospital.post(base+'/profiles/'+reg.body.patientId+'/handwritten').send(note)).status).toBe(200);
    expect(store.get<Profile>('profile',reg.body.patientId)!.revision).toBe(2);
    expect((await (await actor('approver')).post(base+'/profiles/'+reg.body.patientId+'/handwritten').send({...note,requestId:'hw-other',expectedRevision:2})).status).toBe(404);
  });
  it('rejects cross-origin mutations and preserves calendar month boundaries',async()=>{
    expect((await request(app).post('/api/session').set('Origin','https://attacker.test').send({username:'lab',password:'pran-demo-lab'})).status).toBe(403);
    expect(sixMonths(new Date('2026-08-31T00:00:00Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});

import { IDBFactory } from 'fake-indexeddb';
import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { canonical } from '../server/src/platform/store';
import { prepare, unlock, syncReceipts } from '../apps/web/src/platform/offline';
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('navigator',{onLine:false});});
afterEach(()=>vi.unstubAllGlobals());
function snapshot(expired=false){
  const keys=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const now=new Date().toISOString(),expiresAt=new Date(Date.now()+(expired?-10000:3600000)).toISOString();
  const body={id:'snapshot-1',deviceId:'device-1',actorId:'patient-1',createdAt:now,expiresAt,releaseRevision:1,card:{patientId:'patient-1',name:'Synthetic',entries:[],notice:'Summary may be incomplete.',generatedAt:now,expiresAt,receiptId:'receipt-1'}};
  return {...body,signature:sign(null,Buffer.from(canonical(body)),keys.privateKey).toString('base64'),publicKey:keys.publicKey};
}
it('encrypts, verifies, unlocks, and synchronizes a locally committed receipt',async()=>{
  await prepare(snapshot(),'long synthetic phrase');
  const result=await unlock('long synthetic phrase');expect(result.card.name).toBe('Synthetic');
  const sent:unknown[]=[];expect(await syncReceipts(async body=>{sent.push(body);})).toBe(1);
  expect(sent[0]).toMatchObject({snapshotId:'snapshot-1',deviceId:'device-1',sequence:1});
  expect(await syncReceipts(async()=>{})).toBe(0);
});
it('rejects wrong unlock phrases and expired snapshots',async()=>{
  await prepare(snapshot(),'long synthetic phrase');
  await expect(unlock('wrong synthetic phrase')).rejects.toThrow();
  await prepare(snapshot(true),'long synthetic phrase');
  await expect(unlock('long synthetic phrase')).rejects.toThrow('expired');
});
it('rejects modified signed contents even after valid storage encryption',async()=>{
  const value=snapshot();value.card.name='tampered';
  await prepare(value,'long synthetic phrase');
  await expect(unlock('long synthetic phrase')).rejects.toThrow('signature');
});

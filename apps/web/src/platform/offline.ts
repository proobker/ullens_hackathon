import type { Card } from '@pran-rekha/contracts/platform';
type Snapshot={id:string;deviceId:string;actorId:string;createdAt:string;expiresAt:string;releaseRevision:number;card:Card;signature:string;publicKey:string};
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
const bytes=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{const r=indexedDB.open('pran-rekha-offline',1);r.onupgradeneeded=()=>{r.result.createObjectStore('vault');r.result.createObjectStore('receipts',{autoIncrement:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function derive(phrase:string,salt:Uint8Array<ArrayBuffer>) {
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(phrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function prepare(snapshot:Snapshot,phrase:string) {
  if(phrase.length<12)throw new Error('Use an unlock phrase of at least 12 characters.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(phrase,salt);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(snapshot)));
  const db=await database();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put({salt,iv,encrypted,publicKey:snapshot.publicKey,deviceId:snapshot.deviceId,lastTime:Date.now()},'snapshot');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  db.close();
}
export async function unlock(phrase:string):Promise<Snapshot>{
  const db=await database();
  const saved=await new Promise<{salt:Uint8Array<ArrayBuffer>;iv:Uint8Array<ArrayBuffer>;encrypted:ArrayBuffer;publicKey:string;deviceId:string;lastTime:number}>((resolve,reject)=>{const r=db.transaction('vault').objectStore('vault').get('snapshot');r.onsuccess=()=>r.result?resolve(r.result):reject(new Error('No prepared snapshot.'));r.onerror=()=>reject(r.error);});
  if(Date.now()<saved.lastTime)throw new Error('Clock rollback detected.');
  const key=await derive(phrase,saved.salt);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:saved.iv},key,saved.encrypted);
  const snapshot=JSON.parse(new TextDecoder().decode(plaintext)) as Snapshot;
  const {signature,publicKey,...body}=snapshot;
  if(publicKey!==saved.publicKey||snapshot.deviceId!==saved.deviceId||Date.parse(snapshot.expiresAt)<=Date.now())throw new Error('Snapshot expired or binding invalid.');
  const pem=publicKey.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
  const verificationKey=await crypto.subtle.importKey('spki',bytes(pem),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',verificationKey,bytes(signature),new TextEncoder().encode(canonical(body))))throw new Error('Snapshot signature invalid.');
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['vault','receipts'],'readwrite');tx.objectStore('vault').put({...saved,lastTime:Date.now()},'snapshot');tx.objectStore('receipts').add({snapshotId:snapshot.id,deviceId:snapshot.deviceId,at:new Date().toISOString()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  db.close();return snapshot;
}
type QueuedReceipt={snapshotId:string;deviceId:string;at:string};
// Uploads receipts recorded while offline. The IndexedDB key doubles as the idempotent device sequence.
export async function syncReceipts(post:(body:QueuedReceipt&{sequence:number})=>Promise<unknown>):Promise<number>{
  const db=await database();
  const queued=await new Promise<{key:number;value:QueuedReceipt}[]>((resolve,reject)=>{const out:{key:number;value:QueuedReceipt}[]=[];const r=db.transaction('receipts').objectStore('receipts').openCursor();r.onsuccess=()=>{const c=r.result;if(!c){resolve(out);return;}out.push({key:Number(c.key),value:c.value as QueuedReceipt});c.continue();};r.onerror=()=>reject(r.error);});
  let synced=0;
  for(const {key,value} of queued){
    try{await post({...value,sequence:key});}catch{break;}
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('receipts','readwrite');tx.objectStore('receipts').delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
    synced++;
  }
  db.close();return synced;
}

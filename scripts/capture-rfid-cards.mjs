// Save authenticated scans in first-seen order without assigning patients.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const [batchId, deviceId = 'reader-pi-uno', since = new Date().toISOString()] = process.argv.slice(2);
if (!batchId || !Number.isFinite(Date.parse(since))) throw new Error('Usage: node scripts/capture-rfid-cards.mjs BATCH_ID [DEVICE_ID] [SINCE_ISO]');
const db = new DatabaseSync(resolve(process.env.DATABASE_PATH ?? '.data/pran-rekha-demo.sqlite'));
db.exec('PRAGMA busy_timeout=5000');
const get = db.prepare('SELECT body FROM platform_objects WHERE kind=? AND id=?');
const save = db.prepare('INSERT INTO platform_objects(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body');
const previous = get.get('rfid-enrollment-batch', batchId);
const initial = previous ? JSON.parse(previous.body) : {id:batchId,deviceId,startedAt:since,status:'COLLECTING',cards:[]};
if (initial.deviceId !== deviceId || initial.status !== 'COLLECTING') throw new Error('Batch is closed or belongs to another reader');
if (!previous) save.run('rfid-enrollment-batch',batchId,JSON.stringify(initial));

function capture() {
  const added=[];
  db.exec('BEGIN IMMEDIATE');
  try {
    const batch=JSON.parse(get.get('rfid-enrollment-batch',batchId).body);
    if(batch.status!=='COLLECTING'){db.exec('COMMIT');return false;}
    const known=new Set(batch.cards.map(card=>card.tagUid));
    for(const row of db.prepare('SELECT body FROM platform_objects WHERE kind=? ORDER BY rowid').all('scan')){
      const scan=JSON.parse(row.body);
      if(scan.deviceId!==deviceId||Date.parse(scan.receivedAt)<Date.parse(batch.startedAt)||known.has(scan.tagUid))continue;
      const card={order:batch.cards.length+1,tagUid:scan.tagUid,eventId:scan.eventId,firstSeenAt:scan.receivedAt,status:'PENDING_NAME',alreadyLinked:Boolean(get.get('tag',scan.tagUid))};
      batch.cards.push(card);known.add(scan.tagUid);added.push(card);
    }
    if(added.length)save.run('rfid-enrollment-batch',batchId,JSON.stringify(batch));
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  for(const card of added)console.log(`Card ${card.order}: ${card.tagUid} saved, awaiting name${card.alreadyLinked?' (existing association retained)':''}`);
  return true;
}
console.log(`Collecting ${batchId} from ${deviceId}; repeated cards count once. Saved cards persist after stopping.`);
capture();
const interval=setInterval(()=>{if(!capture())stop();},1000);
function stop(){clearInterval(interval);db.close();process.exit(0);}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);

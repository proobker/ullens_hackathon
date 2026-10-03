'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ShieldCheck, Radio, Hospital, FlaskConical, UserRound, LogOut, TriangleAlert, Bell, BellOff, QrCode } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import QRCode from 'qrcode';
import type { Alert, Card, Entry, PlatformProfile } from '@pran-rekha/contracts/platform';
import type { SessionResponse } from '@pran-rekha/contracts';
import { api, labels, requestId, usePreferences } from './client';
import { browserDeviceId, prepareBrowserShell, prepare, syncReceipts, unlock } from './offline';
import { BreakGlass, RecordWorkflows } from './Workflows';

type PortalName='patient'|'paramedic'|'hospital'|'lab';
type Context={staff:{role:string;facility:string;unit:string;reader:string};patients:{id:string;name:string}[]};
const routes=[['patient',UserRound],['paramedic',Radio],['hospital',Hospital],['lab',FlaskConical]] as const;
const patientId='PR-9042-8819';
const demoLocator='demo-opaque-93e74fd4-54c5-45cf-9760-54d64f20e347';
const traumaCategories=['Unconscious polytrauma','Road traffic collision','Cardiac event','Respiratory distress','Burns','Fall from height','Other'];
const signableKinds:Entry['kind'][]=['vital','medication','allergy','condition','implant','blood_group'];
const statusColumns:Alert['status'][]=['EN_ROUTE','ARRIVED','RESOLVED'];

// Short opt-in tone; never plays unless the hospital user enabled sound.
function chime() {
  const audio=new AudioContext(),osc=audio.createOscillator(),gain=audio.createGain();
  osc.frequency.value=880;gain.gain.setValueAtTime(0.15,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.6);
  osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+0.6);osc.onended=()=>void audio.close();
}

export default function Portal({portal}:{portal:PortalName}) {
  const {language,setLanguage}=usePreferences();const t=labels[language];
  const [session,setSession]=useState<SessionResponse|null>(null),[context,setContext]=useState<Context|null>(null);
  const [profile,setProfile]=useState<PlatformProfile|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[username,setUsername]=useState(portal==='patient'?'siddharth':portal);
  const [password,setPassword]=useState('pran-demo-'+(portal==='patient'?'siddharth':portal));
  const [allowed,setAllowed]=useState<string[]>([]),[receipts,setReceipts]=useState<Record<string,unknown>[]>([]);
  const [alerts,setAlerts]=useState<Alert[]>([]),[ledger,setLedger]=useState<Record<string,unknown>[]>([]);
  const [locator,setLocator]=useState('');
  const [link,setLink]=useState<{patientId:string;linkageId:string}|null>(null),[purpose,setPurpose]=useState('Pre-arrival emergency record review');
  const [category,setCategory]=useState(traumaCategories[0]!);
  const [confirmed,setConfirmed]=useState(false),[eta,setEta]=useState(12),[card,setCard]=useState<Card|null>(null);
  const [grantId,setGrantId]=useState(''),[qr,setQr]=useState(''),[phrase,setPhrase]=useState(''),[offlineCard,setOfflineCard]=useState<Card|null>(null);
  const [report,setReport]=useState(''),[source,setSource]=useState<Entry|null>(null);
  const [signKind,setSignKind]=useState<Entry['kind']>('vital'),[clinicalText,setClinicalText]=useState('Blood pressure 118/78 mmHg'),[signSource,setSignSource]=useState('Demo clinician attestation');
  const [face,setFace]=useState(false),[faceConsent,setFaceConsent]=useState(false);
  const [sound,setSound]=useState(false),[fresh,setFresh]=useState<string[]>([]);
  const seenAlerts=useRef<Set<string>|null>(null),soundRef=useRef(false);
  soundRef.current=sound;

  async function refresh() {
    const c=await api<Context>('platform/context');setContext(c);
    if(c.patients.some(p=>p.id===patientId)){
      const p=await api<PlatformProfile>('platform/profiles/'+patientId);setProfile(p);setAllowed(p.release.allowedEntryIds);
      if(c.staff.role==='patient')setReceipts(await api('platform/profiles/'+patientId+'/receipts'));
    }
    if(c.staff.facility==='hospital-demo'){
      const next=(await api<(Alert&{unavailable?:boolean})[]>('platform/alerts/read',{})).filter(a=>!a.unavailable);
      // First load seeds the seen set; later arrivals pulse and optionally chime.
      const added=seenAlerts.current?next.filter(a=>!seenAlerts.current!.has(a.id)).map(a=>a.id):[];
      seenAlerts.current=new Set(next.map(a=>a.id));
      setAlerts(next);
      if(added.length){setFresh(added);setTimeout(()=>setFresh([]),4000);if(soundRef.current)chime();}
    }
    if(c.staff.facility==='lab-demo')setLedger(await api('platform/ledger'));
  }
  async function run(action:()=>Promise<void>) {setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
  async function flushOfflineReceipts() {
    const synced=await syncReceipts(body=>api('platform/offline/receipts',body));
    if(synced)setMessage(synced+' offline access receipt(s) synchronised.');
  }

  useEffect(()=>{const saved=localStorage.getItem('pran-language');if(saved==='ne')setLanguage('ne');
    void api<SessionResponse>('session').then(s=>{setSession(s);return refresh();}).catch(()=>{});
    if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});
  },[]);
  useEffect(()=>{if(!profile)return;void QRCode.toDataURL(profile.locator,{width:180,margin:1}).then(setQr);},[profile?.locator]);
  useEffect(()=>{
    if(!session||portal!=='hospital')return;
    const stream=new EventSource('/api/platform/events');
    stream.addEventListener('refresh',()=>{void refresh().catch(e=>setError(String(e)));});
    // Same-browser fallback: carries only an opaque id; data is refetched through audited endpoints.
    const channel=new BroadcastChannel('pran-events');channel.onmessage=()=>{void refresh().catch(()=>{});};
    return()=>{stream.close();channel.close();};
  },[session,portal]);
  useEffect(()=>{
    if(!session||portal!=='patient')return;
    const online=()=>{void flushOfflineReceipts().catch(()=>{});};
    online();window.addEventListener('online',online);return()=>window.removeEventListener('online',online);
  },[session,portal]);
  useEffect(()=>{if(!card&&!offlineCard)return;const expiry=Math.min(Date.parse((card??offlineCard)!.expiresAt),Date.now()+600000);const timer=setTimeout(()=>{setCard(null);setOfflineCard(null);setSource(null);setGrantId('');setMessage('Session expired. Unlock again.');},Math.max(0,expiry-Date.now()));return()=>clearTimeout(timer);},[card,offlineCard]);

  async function login(){const s=await api<SessionResponse>('session',{username,password});setSession(s);await refresh();}
  async function signOut(){
    await api('session',undefined,'DELETE');
    setSession(null);setContext(null);setProfile(null);setAlerts([]);setCard(null);setOfflineCard(null);setFace(false);setFaceConsent(false);setSource(null);setLink(null);setGrantId('');
    seenAlerts.current=null;
  }
  async function resolveLocator(value:string){setLink(await api('platform/linkage',{locator:value}));setConfirmed(false);setCard(null);setGrantId('');}

  const isAllowed=session&&context&&(portal==='patient'?context.staff.role==='patient':portal==='paramedic'?context.staff.role==='paramedic':portal==='lab'?context.staff.facility==='lab-demo':context.staff.facility==='hospital-demo');
  const daysLeft=profile?Math.ceil((Date.parse(profile.reviewDue)-Date.now())/86400000):0;

  const renderEntries=(entries:Entry[])=>entries.map(entry=><article className={'entry'+(entry.kind==='allergy'?' warning':'')} key={entry.id}>
    <span className="eyebrow">{entry.kind.replace('_',' ')}</span>
    <h3>{entry.kind==='allergy'&&<TriangleAlert size={18} aria-hidden/>} {entry.text}</h3>
    <p>{entry.date}</p>
    {entry.reviewed
      ?<p className="verified"><ShieldCheck size={14} aria-hidden/> Signed demo record · {entry.source}</p>
      :<p className="unverified">Patient report · not clinically verified</p>}
    <button onClick={()=>setSource(entry)}>{t.source}</button>
    {entry.kind==='blood_group'&&<p className="caution">Historical recorded blood group. Follow the treating service's verification and compatibility procedures.</p>}
  </article>);

  const warnings=(c:Card)=>c.entries.filter(e=>e.kind==='allergy').map(e=><p key={e.id} className="allergy-banner" role="alert"><TriangleAlert aria-hidden/> Recorded allergy: {e.text}. Review the attributed source; this is not a treatment instruction.</p>);

  return <div className={'platform '+(portal==='hospital'?'dark':'')}>
    <header className="portal-header"><Link href="/patient" className="logo"><Activity/> Pran Rekha</Link><span className="pill">{t.synthetic}</span>
      <div className="header-right"><button onClick={()=>setLanguage(language==='en'?'ne':'en')}>{language==='en'?'नेपाली':'English'}</button>{session&&<button onClick={()=>void run(signOut)}><LogOut size={16}/>{t.signOut}</button>}</div>
    </header>
    <nav className="portal-nav">{routes.map(([name,Icon])=><Link aria-current={portal===name?'page':undefined} key={name} href={'/'+name}><Icon size={18}/>{t[name]}</Link>)}</nav>
    <main className="portal-main">
      <div className="portal-title"><div><span className="eyebrow">PRAN REKHA / {portal.toUpperCase()}</span><h1>{t[portal]}</h1></div><span className="pill">● {session?'Session active':'Session required'}</span></div>
      {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}

      {!session?<section className="surface login-panel"><h2>{t.signIn}</h2><form onSubmit={e=>{e.preventDefault();void run(login);}}>
        <label>{t.name}<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label>
        <label>{t.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
        <button className="primary" disabled={busy}>{t.signIn}</button></form><p>Demo accounts: siddharth, paramedic, hospital, lab. Password: pran-demo- followed by username.</p></section>
      :!isAllowed?<section className="surface"><h2>This account has no access to this portal.</h2><p>Sign out and authenticate with the provisioned account for this role.</p></section>:<>

      {portal==='patient'&&profile&&<div className="portal-grid">
        <section className="surface pass"><div><span className="eyebrow">Your emergency pass</span><h2>{profile.name}</h2><p className="pass-id">{profile.id}</p>
          <strong className="pass-blood">{profile.entries.find(e=>e.kind==='blood_group')?.text}</strong><p>Historical recorded blood group · verification required</p>
          {profile.entries.find(e=>e.kind==='donor')&&<p>{profile.entries.find(e=>e.kind==='donor')!.text}</p>}
          <p>Date of birth: {profile.dob}</p></div>{qr&&<img src={qr} width={180} height={180} alt="Opaque emergency locator QR"/>}</section>
        <section className={'surface freshness '+profile.freshness.toLowerCase()}><span className="eyebrow">{t.review}</span>
          <div className="radar"><span className="dot" aria-hidden/><h2>{profile.freshness}</h2></div>
          <p>{daysLeft>0?daysLeft+' days until review':'Review overdue'} · {new Date(profile.reviewDue).toLocaleDateString(language==='ne'?'ne-NP':'en-GB')}</p>
          <p>Review schedule; current health and medication use require separate assessment.</p>
          <p className="offer">$50 checkup · 15% Pran Rekha partner discount → $42.50 (simulated)</p>
          <button className="primary" onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/book',{requestId:requestId(),date:new Date().toISOString().slice(0,10)});setMessage('Simulated appointment booked for $42.50. No payment was taken.');})}>{t.booking}</button></section>
        <section className="surface wide"><h2>{t.records}</h2><div className="entries">{renderEntries(profile.entries)}</div></section>
        <section className="surface"><h2>{t.release}</h2><p>Select each entry and its excerpt for emergency sharing.</p>{profile.entries.map(e=><label className="check" key={e.id}><input type="checkbox" checked={allowed.includes(e.id)} onChange={event=>setAllowed(event.target.checked?[...allowed,e.id]:allowed.filter(id=>id!==e.id))}/>{e.text}</label>)}
          <button className="primary" onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/release',{requestId:requestId(),expectedRevision:profile.revision,allowedEntryIds:allowed});await refresh();setMessage('Emergency release updated.');})}>{t.save}</button>
          <button onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/revoke',{requestId:requestId(),expectedRevision:profile.revision});await refresh();})}>{t.revoke}</button>
          <p>{profile.release.revoked?'Revoked':'Active'} · revision {profile.release.revision}</p></section>
        <section className="surface"><h2>{t.report}</h2><textarea value={report} onChange={e=>setReport(e.target.value)} aria-label="Patient report"/><button disabled={!report.trim()} onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/reports',{requestId:requestId(),expectedRevision:profile.revision,text:report,date:new Date().toISOString().slice(0,10)});setReport('');await refresh();})}>{t.report}</button><p>Attributed to you. This does not change a clinician-signed record.</p></section>
        <section className="surface wide"><h2>{t.receipts}</h2><button onClick={()=>void run(refresh)}>{t.refresh}</button>{receipts.length?<ul className="receipts">{receipts.map(r=><li key={String(r.id)}>{String(r.at)} · {String(r.actorId)} · {String(r.purpose)}</li>)}</ul>:<p>No access receipts yet.</p>}</section>
      </div>}

      {portal==='lab'&&profile&&<div className="portal-grid">
        <section className="surface"><span className="eyebrow">Signed in · {context?.staff.facility}</span><h2><ShieldCheck/> {t.sign}</h2><p>{profile.name} · {profile.id} · revision {profile.revision}</p>
          <label>Record type<select value={signKind} onChange={e=>setSignKind(e.target.value as Entry['kind'])}>{signableKinds.map(k=><option key={k} value={k}>{k.replace('_',' ')}</option>)}</select></label>
          <label>Verbatim observation, result or medication<textarea value={clinicalText} onChange={e=>setClinicalText(e.target.value)}/></label>
          <label>Source<input value={signSource} onChange={e=>setSignSource(e.target.value)}/></label>
          <button className="primary" disabled={!clinicalText.trim()||!signSource.trim()} onClick={()=>void run(async()=>{await api('platform/profiles/'+patientId+'/sign',{requestId:requestId(),expectedRevision:profile.revision,entries:[{kind:signKind,text:clinicalText,excerpt:clinicalText,date:new Date().toISOString().slice(0,10),source:signSource}]});await refresh();setMessage('Signed version committed. Patient approval is required for emergency sharing.');})}>Sign &amp; commit to Pran Rekha</button>
          <p>Ed25519 demo signature · integrity verified on every read. Demonstrates record integrity, not accreditation.</p></section>
        <section className="surface"><h2>Simulated revenue ledger</h2>{ledger.length?<ul className="receipts">{ledger.map(l=><li key={String(l.id)}>Checkup ${(Number(l.amountMinor)/100).toFixed(2)} · take-rate (8%) ${(Number(l.commissionMinor)/100).toFixed(2)}</li>)}</ul>:<p>No checkups signed yet.</p>}
          <p><strong>Total commission: ${(ledger.reduce((sum,l)=>sum+Number(l.commissionMinor),0)/100).toFixed(2)}</strong></p><p>Illustrative only. No payments are processed.</p></section>
        <section className="surface wide"><h2>Signed record history</h2><ul className="receipts">{profile.versions.map(v=><li key={v.id}>Version {v.revision} · {v.signer} · {v.signedAt} · review due {v.reviewDue.slice(0,10)}</li>)}</ul></section>
      </div>}

      {portal==='paramedic'&&<div className="portal-grid">
        <section className="surface"><div className="scanner"><Radio size={64}/><p>ESP32 / RC522</p><span>Paired reader: {context?.staff.reader} · Unit {context?.staff.unit}</span></div>
          <button onClick={()=>void run(async()=>{const result=await api<{state:string;patientId:string;linkageId:string}>('platform/rfid/pending');if(result.state==='CANDIDATE'){setLink(result);setConfirmed(false);}else setMessage('Reader: '+result.state);})}>{t.scan}</button>
          <button onClick={()=>void run(async()=>{setLocator(demoLocator);await resolveLocator(demoLocator);setMessage('SIMULATED QR scan of the demo pass.');})}><QrCode size={16}/> Simulate QR scan</button>
          <label>QR / manual locator<input value={locator} onChange={e=>setLocator(e.target.value)}/></label><button disabled={!locator} onClick={()=>void run(()=>resolveLocator(locator))}>{t.manual}</button>
          <label className="check"><input type="checkbox" checked={faceConsent} onChange={e=>{setFaceConsent(e.target.checked);setFace(false);}}/>Consent to session-only face candidate simulation</label><button disabled={!faceConsent} onClick={()=>setFace(true)}>Simulate face candidate</button>{face&&<p>SIMULATED possible local candidate. Record remains locked. No image captured.</p>}
        </section>
        <section className="surface"><h2>Pre-arrival access</h2><p>{link?'Candidate '+link.patientId:'Awaiting locator'}</p>
          <label>Trauma category<select value={category} onChange={e=>setCategory(e.target.value)}>{traumaCategories.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>{t.purpose}<textarea value={purpose} onChange={e=>setPurpose(e.target.value)}/></label>
          <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t.confirm}</label>
          <button disabled={!confirmed||!link} className="primary" onClick={()=>void run(async()=>{const g=await api<{id:string}>('platform/grants',{requestId:requestId(),...link,purpose:category+': '+purpose,deviceId:'staff-browser',confirmed:true});setGrantId(g.id);setCard(await api('platform/cards',{grantId:g.id}));})}>Open approved emergency summary</button>
          <label>Arriving in {eta} minutes<input type="range" min={0} max={120} value={eta} onChange={e=>setEta(Number(e.target.value))}/></label><p>Destination: Pran Rekha Demonstration Hospital</p>
          <button className="dispatch" disabled={!grantId} onClick={()=>void run(async()=>{const result=await api<{id:string}>('platform/dispatch',{requestId:requestId(),grantId,destination:'hospital-demo',etaMinutes:eta});const channel=new BroadcastChannel('pran-events');channel.postMessage({id:result.id});channel.close();setMessage('Dispatch committed. The destination hospital can now read its approved scope.');})}>Initiate pre-arrival ER stream</button>
        </section>
        {card&&<section className="surface wide"><h2>{card.name}</h2>{warnings(card)}<p>{card.notice}</p><div className="entries">{renderEntries(card.entries)}</div></section>}
      </div>}

      {portal==='hospital'&&<section className="surface board">
        <div className="board-heading"><h2>Incoming patients</h2><div className="header-right">
          <button aria-pressed={sound} onClick={()=>setSound(!sound)}>{sound?<Bell size={16}/>:<BellOff size={16}/>} {sound?'Sound on':'Sound off'}</button>
          <button onClick={()=>void run(refresh)}>{t.refresh}</button></div></div>
        {!alerts.length&&<p>No active authorized dispatches.</p>}
        <div className="kanban">{statusColumns.map(status=><div className="column" key={status}><h3>{status.replace('_',' ')} ({alerts.filter(a=>a.status===status).length})</h3>
          {alerts.filter(a=>a.status===status).map(a=><article className={'entry alert'+(fresh.includes(a.id)?' pulse':'')} key={a.id}>
            <h2>{a.card.name}</h2>
            <p className="eta">{a.unit} · ETA {a.etaMinutes} min · {new Date(a.timestamp).toLocaleTimeString()}</p>
            {a.card.entries.filter(e=>e.kind==='blood_group').map(e=><p key={e.id} className="blood">Recorded blood group {e.text} · verify per transfusion protocol</p>)}
            {warnings(a.card)}
            <details><summary>Approved summary ({a.card.entries.length} entries)</summary><p>{a.card.notice}</p>{renderEntries(a.card.entries)}</details>
            {a.status!=='RESOLVED'&&<button className="primary" onClick={()=>void run(async()=>{await api('platform/alerts/'+a.id+'/status',{requestId:requestId(),expectedRevision:a.revision,status:a.status==='EN_ROUTE'?'ARRIVED':'RESOLVED'});await refresh();})}>{a.status==='EN_ROUTE'?'Mark arrived':'Resolve'}</button>}
          </article>)}</div>)}</div>
      </section>}
      </>}

      {portal==='patient'&&<section className="surface offline-panel"><h2>Prepared offline viewer</h2><label>Unlock phrase (12+ characters)<input type="password" value={phrase} onChange={e=>setPhrase(e.target.value)}/></label>
        {session&&profile&&<button onClick={()=>void run(async()=>{await prepareBrowserShell();await prepare(await api('platform/profiles/'+patientId+'/snapshot',{deviceId:await browserDeviceId()}),phrase);setPhrase('');setMessage('Encrypted snapshot prepared on this browser.');})}>{t.offline}</button>}
        <button onClick={()=>void run(async()=>{const snap=await unlock(phrase);setOfflineCard(snap.card);setPhrase('');if(session&&navigator.onLine)await flushOfflineReceipts().catch(()=>{});})}>Unlock saved snapshot</button>
        {offlineCard&&<><p>Offline snapshot from {offlineCard.generatedAt}; later changes and revocations may be unavailable.</p><p>{offlineCard.notice}</p><div className="entries">{renderEntries(offlineCard.entries)}</div></>}
      </section>}
      {session&&isAllowed&&profile&&(portal==='patient'||portal==='lab')&&<RecordWorkflows patientId={profile.id} revision={profile.revision} onChange={refresh} clinician={portal==='lab'}/>}
      {session&&isAllowed&&portal==='hospital'&&<BreakGlass hospital/>}
      {session&&isAllowed&&portal==='paramedic'&&<BreakGlass link={link} purpose={purpose}/>}
      <footer>Nepali copy pending native-speaker review · BS conversion unavailable pending verified reference pairs</footer>
    </main>
    <Dialog.Root open={!!source} onOpenChange={open=>!open&&setSource(null)}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content"><Dialog.Title>{t.source}</Dialog.Title><Dialog.Description>{source?.source} · {source?.date}</Dialog.Description><blockquote>{source?.excerpt}</blockquote><p>{source?.reviewed?'Clinician-authored demo evidence':'Attributed patient report'}</p><Dialog.Close>Close</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

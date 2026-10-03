'use client';
import { useEffect, useState } from 'react';
import { ScanFace, Trash2 } from 'lucide-react';
import type { FaceGalleryEntry } from '@pran-rekha/contracts/platform';
import { api } from './client';
import { describe, FaceInputError, loadModels, match, MAX_ENROLLED, type Enrolled, type FaceResult } from './face';
import { PhotoCapture, type PhotoSource } from './PhotoCapture';

const demoPatient={id:'PR-9042-8819',name:'Siddharth Raj Sharma'};
type Mode='identify'|'enroll';

// Hospital face candidate aid. Matches against faces saved at registration plus session-only enrollments;
// returns candidate handles only and the record stays locked.
export function FaceLookup({patients=[]}:{patients?:{id:string;name:string}[]}){
  const [consent,setConsent]=useState(false),[mode,setMode]=useState<Mode>('identify');
  const [registered,setRegistered]=useState<Enrolled[]>([]),[gallery,setGallery]=useState<Enrolled[]>([]);
  const [label,setLabel]=useState('Demo participant A'),[patientId,setPatientId]=useState(demoPatient.id);
  const [busy,setBusy]=useState(false),[captureKey,setCaptureKey]=useState(0);
  const [modelState,setModelState]=useState<'idle'|'ready'|'unavailable'>('idle');
  const [result,setResult]=useState<FaceResult|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');

  function clearAll(){setGallery([]);setRegistered([]);setResult(null);setCaptureKey(k=>k+1);}
  useEffect(()=>{const onHide=()=>clearAll();window.addEventListener('pagehide',onHide);return()=>window.removeEventListener('pagehide',onHide);},[]);
  // A newly registered patient becomes the enrollment target.
  const latest=patients.at(-1);
  useEffect(()=>{if(latest){setPatientId(latest.id);setLabel(latest.name);}},[latest?.id]);
  useEffect(()=>{
    if(!consent){clearAll();return;}
    void loadModels().then(()=>setModelState('ready'),()=>setModelState('unavailable'));
  },[consent]);
  // Registered faces come from the server; refetch when this session registers someone new.
  useEffect(()=>{
    if(!consent)return;
    void api<FaceGalleryEntry[]>('platform/faces').then(rows=>setRegistered(rows.map(f=>({handle:'reg-'+f.patientId,label:f.name,patientId:f.patientId,descriptor:Float32Array.from(f.descriptor)}))),()=>setError('Registered faces could not be loaded.'));
  },[consent,patients.length]);

  async function process(source:PhotoSource){
    setBusy(true);setError('');setMessage('');setResult(null);
    try{
      const descriptor=await describe(source);
      if(mode==='enroll'){
        if(gallery.length>=MAX_ENROLLED)throw new FaceInputError('Session gallery holds at most '+MAX_ENROLLED+' participants.');
        setGallery([...gallery,{handle:'cand-'+crypto.randomUUID().slice(0,8),label:label.trim(),patientId,descriptor}]);
        setMessage('Enrolled '+label.trim()+' for this session only.');
      }else{
        const all=[...registered,...gallery];
        setResult(all.length?match(descriptor,all):{state:'NO_MATCH'});
      }
    }catch(e){
      if(e instanceof FaceInputError)setError(e.message);
      else{setModelState('unavailable');setResult({state:'UNAVAILABLE'});}
    }finally{setBusy(false);}
  }

  const enrollBlocked=mode==='enroll'&&(!label.trim()||gallery.length>=MAX_ENROLLED);
  const disabled=!consent||modelState!=='ready'||enrollBlocked;

  return <section className="surface wide face-lookup">
    <div className="board-heading"><h2><ScanFace/> Possible patient lookup</h2>
      <span className={'pill'+(modelState==='unavailable'?' unavailable':'')}>{modelState==='unavailable'?'UNAVAILABLE':'LIVE local matcher'}</span></div>
    <p>Suggests a candidate from an uploaded photo or camera frame. Matching runs in this browser against faces saved at registration and any session-only enrollments. A candidate grants no record access.</p>
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Consent to face candidate matching for this image</label>
    {consent&&modelState==='idle'&&<p role="status">Loading local face model…</p>}
    {modelState==='unavailable'&&<p role="alert" className="error">Face model unavailable. Use the RFID, QR or manual locator route.</p>}
    {consent&&<p className="face-counts">Registered faces: {registered.length} · Session-enrolled: {gallery.length}</p>}

    <div className="face-tabs" role="tablist">
      {(['identify','enroll'] as const).map(m=><button key={m} role="tab" aria-selected={mode===m} className={mode===m?'primary':''} onClick={()=>{setMode(m);setResult(null);setError('');setMessage('');}}>{m==='identify'?'Identify':'Session enroll ('+gallery.length+'/'+MAX_ENROLLED+')'}</button>)}
    </div>

    {mode==='enroll'&&<div className="face-enroll">
      <label>Participant label<input value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Synthetic patient<select value={patientId} onChange={e=>setPatientId(e.target.value)}>{[demoPatient,...patients].map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>
    </div>}

    <PhotoCapture key={captureKey} disabled={disabled} busy={busy} alt="Captured image" onImage={process} onError={setError}/>
    {busy&&<p role="status">Analysing locally…</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {message&&<p role="status">{message}</p>}

    {result&&<div className={'face-result '+result.state.toLowerCase()} role="status">
      <span className="eyebrow">{result.state.replace('_',' ')}</span>
      {result.state==='CANDIDATES'&&<><strong>Possible candidate. Record remains locked.</strong>
        <ul className="face-candidates">{result.candidates.map(c=><li key={c.handle}>
          {c.handle.startsWith('reg-')&&<img src={'/api/platform/faces/'+encodeURIComponent(c.patientId)+'/photo'} width={56} height={56} alt={'Registered photo of '+c.label}/>}
          <span>{c.label} · {c.patientId} · {c.handle.startsWith('reg-')?'registered':'session'}</span></li>)}</ul>
        <p>Compare the registered photo, then confirm linkage through the RFID, QR or manual locator workflow before any record access.</p></>}
      {result.state==='NO_MATCH'&&<p>No enrolled candidate is plausible for this image.</p>}
      {result.state==='AMBIGUOUS'&&<p>Too many plausible candidates. Use the locator route.</p>}
      {result.state==='UNAVAILABLE'&&<p>Matcher unavailable. Use the locator route.</p>}
    </div>}

    {gallery.length>0&&<><h3>Session gallery</h3><ul className="receipts">{gallery.map(g=><li key={g.handle}>{g.label} · {g.patientId} <button aria-label={'Remove '+g.label} onClick={()=>setGallery(gallery.filter(x=>x.handle!==g.handle))}><Trash2 size={14}/></button></li>)}</ul>
      <button onClick={()=>setGallery([])}>Clear session gallery</button></>}
  </section>;
}

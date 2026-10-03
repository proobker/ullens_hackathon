'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, ScanFace, Trash2, Upload } from 'lucide-react';
import { describe, FaceInputError, loadModels, match, MAX_ENROLLED, type Enrolled, type FaceResult } from './face';

const demoPatients=['PR-9042-8819'];
type Mode='identify'|'enroll';

// Hospital face candidate aid: session-local gallery, candidate handles only, record stays locked.
export function FaceLookup(){
  const [consent,setConsent]=useState(false),[mode,setMode]=useState<Mode>('identify');
  const [gallery,setGallery]=useState<Enrolled[]>([]),[label,setLabel]=useState('Demo participant A'),[patientId,setPatientId]=useState(demoPatients[0]!);
  const [preview,setPreview]=useState(''),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false);
  const [modelState,setModelState]=useState<'idle'|'ready'|'unavailable'>('idle');
  const [result,setResult]=useState<FaceResult|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),previewRef=useRef('');
  previewRef.current=preview;

  function stopCamera(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);}
  function setImage(url:string){if(previewRef.current)URL.revokeObjectURL(previewRef.current);setPreview(url);}
  function clearAll(){stopCamera();setGallery([]);setResult(null);setImage('');}

  // Clear captures, descriptors and camera tracks on unmount (sign-out) and page close.
  useEffect(()=>{
    const onHide=()=>clearAll();
    window.addEventListener('pagehide',onHide);
    return()=>{window.removeEventListener('pagehide',onHide);stream.current?.getTracks().forEach(t=>t.stop());if(previewRef.current)URL.revokeObjectURL(previewRef.current);};
  },[]);
  useEffect(()=>{
    if(!consent){clearAll();return;}
    void loadModels().then(()=>setModelState('ready'),()=>setModelState('unavailable'));
  },[consent]);

  async function process(source:HTMLImageElement|HTMLCanvasElement){
    setBusy(true);setError('');setMessage('');setResult(null);
    try{
      const descriptor=await describe(source);
      if(mode==='enroll'){
        if(gallery.length>=MAX_ENROLLED)throw new FaceInputError('Gallery holds at most '+MAX_ENROLLED+' participants.');
        setGallery([...gallery,{handle:'cand-'+crypto.randomUUID().slice(0,8),label:label.trim(),patientId,descriptor}]);
        setMessage('Enrolled '+label.trim()+' for this session only.');
      }else setResult(gallery.length?match(descriptor,gallery):{state:'NO_MATCH'});
    }catch(e){
      if(e instanceof FaceInputError)setError(e.message);
      else{setModelState('unavailable');setResult({state:'UNAVAILABLE'});}
    }finally{setBusy(false);}
  }

  async function onFile(file:File|undefined){
    if(!file)return;
    const url=URL.createObjectURL(file);setImage(url);
    const img=new Image();img.src=url;
    try{await img.decode();}catch{setError('Image could not be read.');return;}
    await process(img);
  }

  async function startCamera(){
    setError('');
    try{
      stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
      setCamera(true);
      if(video.current){video.current.srcObject=stream.current;await video.current.play();}
    }catch{setError('Camera unavailable or permission denied. Upload an image instead.');stopCamera();}
  }

  async function capture(){
    const v=video.current;if(!v||!v.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
    canvas.getContext('2d')!.drawImage(v,0,0);
    const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',0.9));
    if(blob)setImage(URL.createObjectURL(blob));
    stopCamera();
    await process(canvas);
  }

  const enrollBlocked=mode==='enroll'&&(!label.trim()||gallery.length>=MAX_ENROLLED);
  const disabled=!consent||busy||modelState!=='ready'||enrollBlocked;

  return <section className="surface wide face-lookup">
    <div className="board-heading"><h2><ScanFace/> Possible patient lookup</h2>
      <span className={'pill'+(modelState==='unavailable'?' unavailable':'')}>{modelState==='unavailable'?'UNAVAILABLE':'LIVE local matcher'}</span></div>
    <p>Suggests a locally enrolled candidate from an uploaded photo or camera frame. Images and face data stay in this browser tab and are cleared on sign-out. A candidate grants no record access.</p>
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Consent to session-only face candidate matching</label>
    {consent&&modelState==='idle'&&<p role="status">Loading local face model…</p>}
    {modelState==='unavailable'&&<p role="alert" className="error">Face model unavailable. Use the RFID, QR or manual locator route.</p>}

    <div className="face-tabs" role="tablist">
      {(['identify','enroll'] as const).map(m=><button key={m} role="tab" aria-selected={mode===m} className={mode===m?'primary':''} onClick={()=>{setMode(m);setResult(null);setError('');setMessage('');}}>{m==='identify'?'Identify':'Enroll ('+gallery.length+'/'+MAX_ENROLLED+')'}</button>)}
    </div>

    {mode==='enroll'&&<div className="face-enroll">
      <label>Participant label<input value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Synthetic patient<select value={patientId} onChange={e=>setPatientId(e.target.value)}>{demoPatients.map(p=><option key={p}>{p}</option>)}</select></label>
    </div>}

    <div className="face-inputs">
      <label className="file-button"><Upload size={16}/> Upload image<input type="file" accept="image/*" capture="user" disabled={disabled} onChange={e=>{void onFile(e.target.files?.[0]);e.target.value='';}}/></label>
      {!camera?<button disabled={disabled} onClick={()=>void startCamera()}><Camera size={16}/> Use camera</button>
        :<><button className="primary" disabled={busy} onClick={()=>void capture()}>Capture</button><button onClick={stopCamera}>Cancel</button></>}
    </div>

    <div className="face-stage">
      <video ref={video} className="face-preview" playsInline muted hidden={!camera}/>
      {!camera&&preview&&<img className="face-preview" src={preview} alt="Captured image (session only)"/>}
    </div>
    {busy&&<p role="status">Analysing locally…</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {message&&<p role="status">{message}</p>}

    {result&&<div className={'face-result '+result.state.toLowerCase()} role="status">
      <span className="eyebrow">{result.state.replace('_',' ')}</span>
      {result.state==='CANDIDATES'&&<><strong>Possible local candidate. Record remains locked.</strong>
        <ul>{result.candidates.map(c=><li key={c.handle}>{c.label} · {c.patientId} · <code>{c.handle}</code></li>)}</ul>
        <p>Confirm linkage through the RFID, QR or manual locator workflow before any record access.</p></>}
      {result.state==='NO_MATCH'&&<p>No enrolled candidate is plausible for this image.</p>}
      {result.state==='AMBIGUOUS'&&<p>Too many plausible candidates. Use the locator route.</p>}
      {result.state==='UNAVAILABLE'&&<p>Matcher unavailable. Use the locator route.</p>}
    </div>}

    {gallery.length>0&&<><h3>Session gallery</h3><ul className="receipts">{gallery.map(g=><li key={g.handle}>{g.label} · {g.patientId} <button aria-label={'Remove '+g.label} onClick={()=>setGallery(gallery.filter(x=>x.handle!==g.handle))}><Trash2 size={14}/></button></li>)}</ul>
      <button onClick={clearAll}>Clear session gallery</button></>}
  </section>;
}

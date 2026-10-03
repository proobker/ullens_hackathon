'use client';
import { useEffect, useState } from 'react';
import { api, requestId } from './client';
import { describe, loadModels } from './face';
import { PhotoCapture, type PhotoSource } from './PhotoCapture';
import { toJpeg } from './RegisterPatient';

export function EnrollFace({patients}:{patients:{id:string;name:string}[]}){
  const [pid,setPid]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[message,setMessage]=useState('');
  const [face,setFace]=useState<{photo:string;descriptor:number[]}|null>(null);
  useEffect(()=>{void loadModels().then(()=>setReady(true),()=>setMessage('Face model unavailable. Try again when the model is available.'));},[]);
  async function capture(source:PhotoSource){
    setBusy(true);setFace(null);setMessage('');
    try{setFace({photo:toJpeg(source),descriptor:Array.from(await describe(source))});}
    catch(e){setMessage(e instanceof Error?e.message:'Photo could not be processed');}finally{setBusy(false);}
  }
  async function save(){
    if(!pid||!face||!consent)return;
    setBusy(true);setMessage('');
    try{await api('platform/profiles/'+pid+'/face',{requestId:requestId(),consent:true,...face});setMessage('Photo saved. Face lookup is now available for this patient.');setFace(null);setConsent(false);}
    catch(e){setMessage(e instanceof Error?e.message:'Photo could not be saved');}finally{setBusy(false);}
  }
  return <section className="surface wide"><h2>Add or update patient photo</h2>
    <p>Select an existing patient. Their RFID card and medical record stay linked.</p>
    <label>Patient<select value={pid} disabled={busy} onChange={e=>{setPid(e.target.value);setFace(null);setConsent(false);setMessage('');}}><option value="">Choose patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name} — {p.id}</option>)}</select></label>
    <PhotoCapture key={pid} disabled={!ready||!pid||busy} busy={busy} alt="Patient enrollment photo" onImage={capture} onError={setMessage}/>
    {face&&<p>One face detected. Ready to save.</p>}
    <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Participant consents to storing this photo for demo face lookup</label>
    <button disabled={!pid||!face||!consent||busy} onClick={()=>void save()}>Save patient photo</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}

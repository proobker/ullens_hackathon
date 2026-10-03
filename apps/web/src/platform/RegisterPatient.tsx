'use client';
import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import QRCode from 'qrcode';
import { BloodGroups, type RegisteredPatient, type RegisterPatientRequest } from '@pran-rekha/contracts/platform';
import { api, requestId } from './client';
import { describe, FaceInputError, loadModels } from './face';
import { PhotoCapture, type PhotoSource } from './PhotoCapture';

const MAX_SIDE=480;
// Downscale to a small JPEG before upload; the server stores it in the demo database.
function toJpeg(source:PhotoSource){
  const w=source instanceof HTMLImageElement?source.naturalWidth:source.width,h=source instanceof HTMLImageElement?source.naturalHeight:source.height;
  const scale=Math.min(1,MAX_SIDE/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d')!.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.85);
}

const blank={name:'',dob:'',bloodGroup:'',allergies:'',tagUid:'',username:'',password:''};

// Hospital registration: synthetic record, patient login and a required face photo. Emergency sharing stays off until the patient opts in.
export function RegisterPatient({onRegistered}:{onRegistered:(p:{id:string;name:string})=>void}){
  const [form,setForm]=useState(blank),[synthetic,setSynthetic]=useState(false),[photoConsent,setPhotoConsent]=useState(false);
  const [face,setFace]=useState<{photo:string;descriptor:number[]}|null>(null),[faceBusy,setFaceBusy]=useState(false),[faceError,setFaceError]=useState('');
  const [modelState,setModelState]=useState<'idle'|'ready'|'unavailable'>('idle'),[captureKey,setCaptureKey]=useState(0),[donePhoto,setDonePhoto]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<RegisteredPatient|null>(null),[qr,setQr]=useState('');
  const field=(key:keyof typeof blank)=>({value:form[key],onChange:(e:{target:{value:string}})=>setForm({...form,[key]:e.target.value})});
  useEffect(()=>{void loadModels().then(()=>setModelState('ready'),()=>setModelState('unavailable'));},[]);
  useEffect(()=>{if(done)void QRCode.toDataURL(done.locator,{width:160,margin:1}).then(setQr);else setQr('');},[done]);

  async function onPhoto(source:PhotoSource){
    setFaceBusy(true);setFaceError('');setFace(null);
    try{setFace({photo:toJpeg(source),descriptor:Array.from(await describe(source))});}
    catch(e){if(e instanceof FaceInputError)setFaceError(e.message);else{setModelState('unavailable');}}
    finally{setFaceBusy(false);}
  }

  async function submit(){
    setBusy(true);setError('');setDone(null);
    try{
      const body:RegisterPatientRequest={requestId:requestId(),name:form.name.trim(),dob:form.dob,username:form.username.trim(),password:form.password,photo:face!.photo,descriptor:face!.descriptor,
        ...(form.bloodGroup?{bloodGroup:form.bloodGroup as RegisterPatientRequest['bloodGroup']}:{}),
        ...(form.allergies.trim()?{allergies:form.allergies.trim()}:{}),
        ...(form.tagUid.trim()?{tagUid:form.tagUid.trim()}:{})};
      const result=await api<RegisteredPatient>('platform/patients',body);
      setDone(result);setDonePhoto(face!.photo);setForm(blank);setSynthetic(false);setPhotoConsent(false);setFace(null);setCaptureKey(k=>k+1);onRegistered({id:result.patientId,name:result.name});
    }catch(e){setError(e instanceof Error?e.message:'Registration failed');}
    finally{setBusy(false);}
  }

  const ready=synthetic&&photoConsent&&face&&form.name.trim()&&form.dob&&/^[a-z0-9_-]{3,32}$/.test(form.username.trim())&&form.password.length>=12;
  return <section className="surface wide register-patient">
    <h2><UserPlus/> Register patient</h2>
    <p>Creates a synthetic Pran Rekha record, a patient login, an opaque QR locator and a saved face photo for lookup. Blood group and allergies are signed by this hospital; emergency sharing stays off until the patient approves each entry.</p>
    <form className="register-grid" onSubmit={e=>{e.preventDefault();if(ready)void submit();}}>
      <label>Full name<input {...field('name')} autoComplete="off"/></label>
      <label>Date of birth<input type="date" {...field('dob')} max={new Date().toISOString().slice(0,10)}/></label>
      <label>Blood group<select {...field('bloodGroup')}><option value="">Not recorded</option>{BloodGroups.map(g=><option key={g}>{g}</option>)}</select></label>
      <label>Recorded allergies<input {...field('allergies')} placeholder="e.g. Penicillin — anaphylaxis"/></label>
      <label>RFID tag UID (optional)<input {...field('tagUid')} placeholder="8, 14 or 20 hex characters"/></label>
      <label>Patient username<input {...field('username')} autoComplete="off" placeholder="lowercase, 3–32 characters"/></label>
      <label>Initial password<input type="password" {...field('password')} autoComplete="new-password" placeholder="12+ characters"/></label>
      <fieldset className="register-photo">
        <legend>Face photo (required)</legend>
        {modelState==='idle'&&<p role="status">Loading local face model…</p>}
        {modelState==='unavailable'?<p role="alert" className="error">Face model unavailable — registration needs a photo.</p>
          :<PhotoCapture key={captureKey} disabled={modelState!=='ready'} busy={faceBusy} alt="Registration photo" onImage={onPhoto} onError={setFaceError}/>}
        {faceBusy&&<p role="status">Checking for exactly one face…</p>}
        {faceError&&<p role="alert" className="error">{faceError}</p>}
        <p className={face?'verified':'unverified'}>{face?'One face detected. Photo ready — upload or capture again to retake.':'A face photo is required. Upload or capture an image of exactly one person.'}</p>
      </fieldset>
      <label className="check"><input type="checkbox" checked={photoConsent} onChange={e=>setPhotoConsent(e.target.checked)}/>Participant consents to storing this face photo on the demo server</label>
      <label className="check"><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>Synthetic demonstration data only — no real patient information</label>
      <button className="primary" disabled={!ready||busy}>Register patient</button>
    </form>
    {error&&<p role="alert" className="error">{error==='CONFLICT'?'Username or RFID tag is already registered.':error==='INVALID_INPUT'?'Some fields are invalid. Check the date of birth and RFID tag UID format.':error}</p>}
    {done&&<div className="register-result" role="status">
      <div><span className="eyebrow">Registered</span><h3>{done.name}</h3><p className="pass-id">{done.patientId}</p>
        <p>Patient login: <strong>{done.username}</strong> · sign in at /patient</p>
        <p>Emergency sharing is off until the patient approves entries.</p></div>
      {donePhoto&&<img src={donePhoto} width={120} alt={'Registered photo of '+done.name}/>}
      {qr&&<img src={qr} width={160} height={160} alt={'Opaque emergency locator QR for '+done.name}/>}
    </div>}
  </section>;
}

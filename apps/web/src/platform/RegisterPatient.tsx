'use client';
import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import QRCode from 'qrcode';
import { BloodGroups, type RegisteredPatient, type RegisterPatientRequest } from '@pran-rekha/contracts/platform';
import { api, requestId } from './client';

const blank={name:'',dob:'',bloodGroup:'',allergies:'',tagUid:'',username:'',password:''};

// Hospital registration: synthetic record + patient login. Emergency sharing stays off until the patient opts in.
export function RegisterPatient({onRegistered}:{onRegistered:(p:{id:string;name:string})=>void}){
  const [form,setForm]=useState(blank),[synthetic,setSynthetic]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<RegisteredPatient|null>(null),[qr,setQr]=useState('');
  const field=(key:keyof typeof blank)=>({value:form[key],onChange:(e:{target:{value:string}})=>setForm({...form,[key]:e.target.value})});
  useEffect(()=>{if(done)void QRCode.toDataURL(done.locator,{width:160,margin:1}).then(setQr);else setQr('');},[done]);

  async function submit(){
    setBusy(true);setError('');setDone(null);
    try{
      const body:RegisterPatientRequest={requestId:requestId(),name:form.name.trim(),dob:form.dob,username:form.username.trim(),password:form.password,
        ...(form.bloodGroup?{bloodGroup:form.bloodGroup as RegisterPatientRequest['bloodGroup']}:{}),
        ...(form.allergies.trim()?{allergies:form.allergies.trim()}:{}),
        ...(form.tagUid.trim()?{tagUid:form.tagUid.trim()}:{})};
      const result=await api<RegisteredPatient>('platform/patients',body);
      setDone(result);setForm(blank);setSynthetic(false);onRegistered({id:result.patientId,name:result.name});
    }catch(e){setError(e instanceof Error?e.message:'Registration failed');}
    finally{setBusy(false);}
  }

  const ready=synthetic&&form.name.trim()&&form.dob&&/^[a-z0-9_-]{3,32}$/.test(form.username.trim())&&form.password.length>=12;
  return <section className="surface wide register-patient">
    <h2><UserPlus/> Register patient</h2>
    <p>Creates a synthetic Pran Rekha record, a patient login and an opaque QR locator. Blood group and allergies are signed by this hospital; emergency sharing stays off until the patient approves each entry.</p>
    <form className="register-grid" onSubmit={e=>{e.preventDefault();if(ready)void submit();}}>
      <label>Full name<input {...field('name')} autoComplete="off"/></label>
      <label>Date of birth<input type="date" {...field('dob')} max={new Date().toISOString().slice(0,10)}/></label>
      <label>Blood group<select {...field('bloodGroup')}><option value="">Not recorded</option>{BloodGroups.map(g=><option key={g}>{g}</option>)}</select></label>
      <label>Recorded allergies<input {...field('allergies')} placeholder="e.g. Penicillin — anaphylaxis"/></label>
      <label>RFID tag UID (optional)<input {...field('tagUid')} placeholder="8, 14 or 20 hex characters"/></label>
      <label>Patient username<input {...field('username')} autoComplete="off" placeholder="lowercase, 3–32 characters"/></label>
      <label>Initial password<input type="password" {...field('password')} autoComplete="new-password" placeholder="12+ characters"/></label>
      <label className="check"><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>Synthetic demonstration data only — no real patient information</label>
      <button className="primary" disabled={!ready||busy}>Register patient</button>
    </form>
    {error&&<p role="alert" className="error">{error==='CONFLICT'?'Username or RFID tag is already registered.':error==='INVALID_INPUT'?'Some fields are invalid. Check the date of birth and RFID tag UID format.':error}</p>}
    {done&&<div className="register-result" role="status">
      <div><span className="eyebrow">Registered</span><h3>{done.name}</h3><p className="pass-id">{done.patientId}</p>
        <p>Patient login: <strong>{done.username}</strong> · sign in at /patient</p>
        <p>Emergency sharing is off until the patient approves entries.</p></div>
      {qr&&<img src={qr} width={160} height={160} alt={'Opaque emergency locator QR for '+done.name}/>}
    </div>}
  </section>;
}

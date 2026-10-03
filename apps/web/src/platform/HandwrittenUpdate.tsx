'use client';
import { useEffect, useState } from 'react';
import { NotebookPen, Plus, TriangleAlert } from 'lucide-react';
import type { Entry, HandwrittenUpdateRequest, PlatformProfile } from '@pran-rekha/contracts/platform';
import { api, requestId } from './client';
import { LOW_CONFIDENCE, toCandidates, type Candidate } from './categorize';
import { correctLine } from './medical-lexicon';
import { recognize, TROCR_ENGINE, type OcrProgress } from './ocr';
import { PhotoCapture, type PhotoSource } from './PhotoCapture';

const kinds:Entry['kind'][]=['medication','allergy','condition','vital','implant','blood_group'];
const label=(k:string)=>k.replace('_',' ');

function toJpeg(source:PhotoSource,maxSide=1600){
  const w=source instanceof HTMLImageElement?source.naturalWidth:source.width,h=source instanceof HTMLImageElement?source.naturalHeight:source.height;
  const scale=Math.min(1,maxSide/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d')!.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.85);
}

// Handwritten prescription / medical card: local OCR proposes lines and categories; the clinician corrects,
// confirms against the original and signs. Nothing is committed from OCR output alone.
export function HandwrittenUpdate({patients,onChange}:{patients:{id:string;name:string}[];onChange:()=>Promise<void>}){
  const [patientId,setPatientId]=useState(patients[0]?.id??''),[revision,setRevision]=useState<number|null>(null);
  const [image,setImage]=useState(''),[ocrText,setOcrText]=useState(''),[rows,setRows]=useState<Candidate[]>([]);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10)),[compared,setCompared]=useState(false);
  const [engine,setEngine]=useState(TROCR_ENGINE),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[captureKey,setCaptureKey]=useState(0);

  useEffect(()=>{if(!patients.some(p=>p.id===patientId))setPatientId(patients[0]?.id??'');},[patients]);
  async function loadRevision(id=patientId){if(!id){setRevision(null);return;}setRevision((await api<PlatformProfile>('platform/profiles/'+id)).revision);}
  useEffect(()=>{void loadRevision().catch(()=>setRevision(null));},[patientId]);
  function reset(){setImage('');setOcrText('');setRows([]);setCompared(false);setCaptureKey(k=>k+1);}

  async function onImage(source:PhotoSource){
    setBusy(true);setError('');setStatus('Preparing the photo…');setOcrText('');setRows([]);setCompared(false);
    const progress=(p:OcrProgress)=>setStatus(p.stage==='preparing'?'Finding lines of writing…':p.stage==='loading'?'Downloading the handwriting model '+p.progress+'% (first time only, about 64 MB)…':'Reading line '+p.line+' of '+p.total+' on this device…');
    try{
      setImage(toJpeg(source));
      const result=await recognize(source,progress);
      setOcrText(result.text);setEngine(result.engine);
      const candidates=toCandidates(result.lines);
      setRows(candidates);
      setStatus(candidates.length?candidates.length+' line(s) recognized. Correct each line and its category against the image.':'No text recognized. Add lines manually or retake a sharper, well-lit photo.');
    }catch{setError('OCR engine unavailable. Add lines manually from the image.');setStatus('');}
    finally{setBusy(false);}
  }

  const update=(id:string,patch:Partial<Candidate>)=>setRows(rows.map(r=>r.id===id?{...r,...patch}:r));
  const included=rows.filter(r=>r.include);
  const ready=!!image&&!!patientId&&revision!==null&&compared&&included.length>0&&included.every(r=>r.kind&&r.text.trim());

  async function submit(){
    setBusy(true);setError('');
    try{
      const body:HandwrittenUpdateRequest={requestId:requestId(),expectedRevision:revision!,image,ocrText:ocrText.slice(0,8000),engine,
        entries:included.map(r=>({kind:r.kind as HandwrittenUpdateRequest['entries'][number]['kind'],text:r.text.trim(),original:r.original,date}))};
      await api('platform/profiles/'+patientId+'/handwritten',body);
      reset();setStatus(body.entries.length+' entr'+(body.entries.length===1?'y':'ies')+' signed. Patient approval is required for emergency sharing.');
      await loadRevision();await onChange();
    }catch(e){setError(e instanceof Error&&e.message==='CONFLICT'?'The record changed since you started. Reload and review again.':e instanceof Error?e.message:'Signing failed');}
    finally{setBusy(false);}
  }

  return <section className="surface wide handwritten">
    <div className="board-heading"><h2><NotebookPen/> Handwritten prescription or medical card</h2><span className="pill">OCR candidate · verify against image</span></div>
    <p>Photograph or upload a handwritten note. Text is recognized on this device and sorted into categories; you correct every line before signing. The original image and raw OCR text are kept as the source.</p>
    {!patients.length?<p>No patients you can update yet. Hospital clinicians can update patients they registered.</p>:<>
      <label>Patient<select value={patientId} onChange={e=>{setPatientId(e.target.value);reset();setStatus('');}}>{patients.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label>
      <p className="ocr-tips">For best results: lay the note flat in good light, fill the frame with it, and photograph one note at a time.</p>
      <PhotoCapture key={captureKey} disabled={!patientId} busy={busy} alt="Handwritten note" showPreview={false} facing="environment" onImage={onImage} onError={setError}/>
      {status&&<p role="status">{status}</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      {image&&<div className="ocr-layout">
        <img className="ocr-original" src={image} alt="Handwritten original for comparison"/>
        <div className="ocr-review">
          {rows.map(r=><div className={'ocr-row'+(r.include?'':' excluded')} key={r.id}>
            <input type="checkbox" checked={r.include} aria-label={'Include line: '+r.original} onChange={e=>update(r.id,{include:e.target.checked})}/>
            <div className="ocr-text">
              {r.original&&<small>OCR: {r.original}{r.confidence<LOW_CONFIDENCE&&<span className="low-confidence"><TriangleAlert size={12}/> low confidence</span>}</small>}
              {!!r.corrections?.length&&<small className="ocr-corrections">Dictionary: {r.corrections.join(', ')}</small>}
              {r.alternative&&<small>Other reading: <button type="button" className="link-button" title="Use this reading" onClick={()=>update(r.id,{text:correctLine(r.alternative!).text})}>{r.alternative}</button></small>}
              <input aria-label="Corrected text" value={r.text} onChange={e=>update(r.id,{text:e.target.value})}/>
            </div>
            <select aria-label="Category" value={r.kind??''} onChange={e=>update(r.id,{kind:(e.target.value||null) as Candidate['kind']})} className={r.include&&!r.kind?'needs-kind':''}>
              <option value="">Choose category…</option>{kinds.map(k=><option key={k} value={k}>{label(k)}</option>)}
            </select>
          </div>)}
          <button type="button" onClick={()=>setRows([...rows,{id:'manual-'+crypto.randomUUID(),original:'',text:'',kind:null,confidence:100,include:true}])}><Plus size={16}/> Add line</button>
          <label>Date written<input type="date" value={date} max={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)}/></label>
          <label className="check"><input type="checkbox" checked={compared} onChange={e=>setCompared(e.target.checked)}/>I compared every included line with the handwritten original</label>
          <button className="primary" disabled={!ready||busy} onClick={()=>void submit()}>Sign &amp; commit {included.length} entr{included.length===1?'y':'ies'}</button>
        </div>
      </div>}
    </>}
  </section>;
}

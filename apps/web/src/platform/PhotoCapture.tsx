'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';

export type PhotoSource=HTMLImageElement|HTMLCanvasElement;

// Upload or camera capture with a local preview. Parents remount it (key) to clear the preview.
export function PhotoCapture({disabled,busy=false,alt,onImage,onError,showPreview=true,facing='user'}:{disabled:boolean;busy?:boolean;alt:string;showPreview?:boolean;facing?:'user'|'environment';onImage:(source:PhotoSource)=>Promise<void>;onError:(message:string)=>void}){
  const [preview,setPreview]=useState(''),[camera,setCamera]=useState(false);
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),previewRef=useRef('');
  previewRef.current=preview;

  function stopCamera(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);}
  function setImage(url:string){if(previewRef.current)URL.revokeObjectURL(previewRef.current);setPreview(url);}
  // Release camera tracks and preview URLs on unmount and page close.
  useEffect(()=>{
    const onHide=()=>{stopCamera();setImage('');};
    window.addEventListener('pagehide',onHide);
    return()=>{window.removeEventListener('pagehide',onHide);stream.current?.getTracks().forEach(t=>t.stop());if(previewRef.current)URL.revokeObjectURL(previewRef.current);};
  },[]);
  useEffect(()=>{if(disabled)stopCamera();},[disabled]);

  async function onFile(file:File|undefined){
    if(!file)return;
    const url=URL.createObjectURL(file);setImage(url);
    const img=new Image();img.src=url;
    try{await img.decode();}catch{onError('Image could not be read.');return;}
    await onImage(img);
  }
  async function startCamera(){
    try{
      stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing}});
      setCamera(true);
      if(video.current){video.current.srcObject=stream.current;await video.current.play();}
    }catch{onError('Camera unavailable or permission denied. Upload an image instead.');stopCamera();}
  }
  async function capture(){
    const v=video.current;if(!v||!v.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
    canvas.getContext('2d')!.drawImage(v,0,0);
    const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/jpeg',0.9));
    if(blob)setImage(URL.createObjectURL(blob));
    stopCamera();
    await onImage(canvas);
  }

  return <>
    <div className="face-inputs">
      <label className="file-button"><Upload size={16}/> Upload image<input type="file" accept="image/*" capture={facing} disabled={disabled||busy} onChange={e=>{void onFile(e.target.files?.[0]);e.target.value='';}}/></label>
      {!camera?<button type="button" disabled={disabled||busy} onClick={()=>void startCamera()}><Camera size={16}/> Use camera</button>
        :<><button type="button" className="primary" disabled={busy} onClick={()=>void capture()}>Capture</button><button type="button" onClick={stopCamera}>Cancel</button></>}
    </div>
    <div className="face-stage">
      <video ref={video} className="face-preview" playsInline muted hidden={!camera}/>
      {!camera&&showPreview&&preview&&<img className="face-preview" src={preview} alt={alt}/>}
    </div>
  </>;
}

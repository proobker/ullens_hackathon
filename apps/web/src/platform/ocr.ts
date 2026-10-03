// Local handwriting OCR. The page is lighting-normalised, deskewed and split into lines; each line is read by
// TrOCR (trained on real handwriting, in a Web Worker) and by Tesseract.js (print-trained, bundled under
// /tesseract), and the reading that makes more sense as prescription text wins. TrOCR is better on cursive,
// Tesseract on neat print. Nothing leaves the browser except TrOCR's one-time model download.
// Output is a candidate only: a clinician must compare every line with the original before signing.
import { binarize, estimateSkew, normalize, segmentLines, toGray, type Box } from './ocr-image';
import { correctLine, plausibility } from './medical-lexicon';
import type { WorkerMessage, WorkerRequest } from './ocr.worker';

export const TROCR_ENGINE='trocr-small-handwritten-q8+tesseract.js@7.0.0-line+lexicon@1';
export const TESSERACT_ENGINE='tesseract.js@7.0.0/eng-best_int+lexicon';
// alternative = the losing engine's reading of the same line, shown to the reviewer when it differs.
export type OcrLine={text:string;confidence:number;alternative?:string};
export type OcrResult={text:string;lines:OcrLine[];engine:string};
export type OcrProgress={stage:'preparing'}|{stage:'loading';progress:number}|{stage:'reading';line:number;total:number};
type Source=HTMLImageElement|HTMLCanvasElement;

// Prepared page: normalised, deskewed grayscale canvas plus the detected line boxes.
function prepare(source:Source):{canvas:HTMLCanvasElement;boxes:Box[]}{
  const w=source instanceof HTMLImageElement?source.naturalWidth:source.width,h=source instanceof HTMLImageElement?source.naturalHeight:source.height;
  const scale=Math.min(1,2000/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const put=(gray:Uint8Array)=>{
    const img=ctx.createImageData(canvas.width,canvas.height);
    for(let p=0,i=0;p<gray.length;p++,i+=4){img.data[i]=img.data[i+1]=img.data[i+2]=gray[p]!;img.data[i+3]=255;}
    ctx.putImageData(img,0,0);
  };
  let gray=normalize(toGray(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height));
  put(gray.data);
  const skew=estimateSkew(binarize(gray),gray.width,gray.height);
  if(Math.abs(skew)>=0.5){
    // Positive skew means lines rise to the right; a clockwise rotation (canvas y points down) levels them.
    const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d')!.drawImage(canvas,0,0);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(skew*Math.PI/180);ctx.drawImage(copy,-canvas.width/2,-canvas.height/2);ctx.restore();
    gray=toGray(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
  }
  return {canvas,boxes:segmentLines(binarize(gray),gray.width,gray.height)};
}

let worker:Worker|null=null,nextId=1;
function getWorker(){
  worker??=new Worker(new URL('./ocr.worker.ts',import.meta.url),{type:'module'});
  return worker;
}

function recognizeTrocr(canvas:HTMLCanvasElement,boxes:Box[],onProgress:(p:OcrProgress)=>void):Promise<OcrLine[]>{
  const ctx=canvas.getContext('2d')!,id=nextId++;
  const lines=boxes.map(b=>{const img=ctx.getImageData(b.x,b.y,b.w,b.h);return {data:img.data,width:b.w,height:b.h};});
  const results:OcrLine[]=new Array(lines.length);
  return new Promise((resolve,reject)=>{
    const w=getWorker();
    const onMessage=(event:MessageEvent<WorkerMessage>)=>{
      const m=event.data;if(m.id!==id)return;
      if(m.type==='loading')onProgress({stage:'loading',progress:m.progress});
      else if(m.type==='line'){results[m.index]={text:m.text,confidence:m.confidence};onProgress({stage:'reading',line:m.index+1,total:m.total});}
      else{w.removeEventListener('message',onMessage);w.removeEventListener('error',onError);m.type==='done'?resolve(results):reject(new Error(m.message));}
    };
    const onError=(event:ErrorEvent)=>{w.removeEventListener('message',onMessage);w.removeEventListener('error',onError);worker?.terminate();worker=null;reject(new Error(event.message||'OCR worker failed'));};
    w.addEventListener('message',onMessage);w.addEventListener('error',onError);
    w.postMessage({id,lines} satisfies WorkerRequest,lines.map(l=>l.data.buffer));
  });
}

type Tesseract=Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let tesseract:Promise<Tesseract>|null=null;
function getTesseract():Promise<Tesseract>{
  tesseract??=(async()=>{
    const {createWorker,OEM}=await import('tesseract.js');
    return createWorker('eng',OEM.LSTM_ONLY,{workerPath:'/tesseract/worker.min.js',corePath:'/tesseract',langPath:'/tesseract/lang',workerBlobURL:false});
  })().catch(e=>{tesseract=null;throw e;});
  return tesseract;
}

async function recognizeTesseract(canvas:HTMLCanvasElement):Promise<OcrLine[]>{
  const t=await getTesseract();
  await t.setParameters({tessedit_pageseg_mode:'3' as never});
  const {data}=await t.recognize(canvas,{},{text:true,blocks:true});
  const lines=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.map(l=>({text:l.text.trim(),confidence:Math.round(l.confidence)}))));
  return lines.length?lines:data.text.split('\n').map(text=>({text:text.trim(),confidence:0}));
}

// Tesseract in single-line mode on each segmented line, with a white margin it expects around text.
async function recognizeTesseractLines(canvas:HTMLCanvasElement,boxes:Box[]):Promise<OcrLine[]>{
  const t=await getTesseract();
  await t.setParameters({tessedit_pageseg_mode:'7' as never});
  const out:OcrLine[]=[];
  for(const b of boxes){
    const pad=Math.round(b.h*0.3),crop=document.createElement('canvas');crop.width=b.w+2*pad;crop.height=b.h+2*pad;
    const c=crop.getContext('2d')!;c.fillStyle='#fff';c.fillRect(0,0,crop.width,crop.height);c.drawImage(canvas,b.x,b.y,b.w,b.h,pad,pad,b.w,b.h);
    const {data}=await t.recognize(crop);
    out.push({text:data.text.replace(/\s+/g,' ').trim(),confidence:Math.round(data.confidence)});
  }
  return out;
}

// Prescription-sense first, engine confidence second. TrOCR can invent fluent text for a smudge, so a reading
// far longer than the line's shape allows (about 3 characters per line-height of width) is discarded.
function score(line:OcrLine|undefined,box:Box,engine:'trocr'|'tesseract'){
  if(!line?.text)return -1;
  if(engine==='trocr'&&line.text.length>3*(box.w/box.h)+6)return -1;
  return 0.75*plausibility(correctLine(line.text).text)+0.25*line.confidence/100;
}
function pick(trocr:OcrLine[]|null,tesseract:OcrLine[]|null,boxes:Box[]):OcrLine[]{
  return boxes.map((box,i)=>{
    const a=trocr?.[i],b=tesseract?.[i],sa=score(a,box,'trocr'),sb=score(b,box,'tesseract');
    const [win,lose]=sa>=sb?[a,b]:[b,a];
    if(!win||Math.max(sa,sb)<0)return {text:'',confidence:0};
    const alternative=lose?.text&&correctLine(lose.text).text!==correctLine(win.text).text?lose.text:undefined;
    return {text:win.text,confidence:win.confidence,...(alternative?{alternative}:{})};
  });
}

function preferredEngine(){try{return localStorage.getItem('pran-ocr-engine');}catch{return null;}}

export async function recognize(source:Source,onProgress:(p:OcrProgress)=>void=()=>{}):Promise<OcrResult>{
  onProgress({stage:'preparing'});
  const {canvas,boxes}=prepare(source);
  const done=(lines:OcrLine[],engine:string)=>({text:lines.map(l=>l.text).join('\n'),lines,engine});
  if(preferredEngine()==='tesseract'||!boxes.length)return done(await recognizeTesseract(canvas),TESSERACT_ENGINE);
  const [trocr,tesseract]=await Promise.all([
    recognizeTrocr(canvas,boxes,onProgress).catch(error=>{console.warn('Handwriting model unavailable; using Tesseract only',error);return null;}),
    recognizeTesseractLines(canvas,boxes).catch(()=>null),
  ]);
  if(!trocr&&!tesseract)throw new Error('No OCR engine available');
  return done(pick(trocr,tesseract,boxes).filter(l=>l.text),trocr?TROCR_ENGINE:TESSERACT_ENGINE);
}

// Local handwriting/print OCR (Tesseract.js, LSTM English). Assets are bundled under /tesseract; nothing leaves the browser.
// Output is a candidate only: a clinician must compare every line with the original before signing.
export const OCR_ENGINE='tesseract.js@7.0.0/eng-best_int';
export type OcrLine={text:string;confidence:number};
type Worker=Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let worker:Promise<Worker>|null=null;

function getWorker():Promise<Worker>{
  worker??=(async()=>{
    const {createWorker,OEM}=await import('tesseract.js');
    return createWorker('eng',OEM.LSTM_ONLY,{workerPath:'/tesseract/worker.min.js',corePath:'/tesseract',langPath:'/tesseract/lang',workerBlobURL:false});
  })().catch(e=>{worker=null;throw e;});
  return worker;
}

// Grayscale + contrast stretch on a bounded canvas; improves Tesseract on phone photos of paper.
function preprocess(source:HTMLImageElement|HTMLCanvasElement){
  const w=source instanceof HTMLImageElement?source.naturalWidth:source.width,h=source instanceof HTMLImageElement?source.naturalHeight:source.height;
  const scale=Math.min(1,2000/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d')!;ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;
  let min=255,max=0;
  for(let i=0;i<d.length;i+=4){const g=Math.round(0.299*d[i]!+0.587*d[i+1]!+0.114*d[i+2]!);d[i]=g;if(g<min)min=g;if(g>max)max=g;}
  const range=Math.max(1,max-min);
  for(let i=0;i<d.length;i+=4){const g=Math.round((d[i]!-min)*255/range);d[i]=d[i+1]=d[i+2]=g;}
  ctx.putImageData(img,0,0);return canvas;
}

export async function recognize(source:HTMLImageElement|HTMLCanvasElement):Promise<{text:string;lines:OcrLine[]}>{
  const w=await getWorker();
  const {data}=await w.recognize(preprocess(source),{},{text:true,blocks:true});
  const lines=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.map(l=>({text:l.text.trim(),confidence:Math.round(l.confidence)}))));
  return {text:data.text,lines:lines.length?lines:data.text.split('\n').map(text=>({text:text.trim(),confidence:0}))};
}

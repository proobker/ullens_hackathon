// Face candidate matcher. Detection, description and matching run in the browser. The gallery is the
// faces saved at hospital registration (photo + descriptor stored server-side, hospital-only) plus
// session-only enrollments that are never sent to the API. Probe images are never uploaded.
export type Enrolled={handle:string;label:string;patientId:string;descriptor:Float32Array};
export type Candidate={handle:string;label:string;patientId:string};
export type FaceResult={state:'NO_MATCH'}|{state:'CANDIDATES';candidates:Candidate[]}|{state:'AMBIGUOUS'}|{state:'UNAVAILABLE'};
export type FaceSource=HTMLImageElement|HTMLVideoElement|HTMLCanvasElement;
export class FaceInputError extends Error {}

export const MAX_ENROLLED=5,MAX_CANDIDATES=3,MATCH_THRESHOLD=0.5;

// Pure decision: indexes of plausible candidates, ordered best first. Distances never leave this module.
export function classify(distances:number[],threshold=MATCH_THRESHOLD):{state:'NO_MATCH'|'AMBIGUOUS'}|{state:'CANDIDATES';indexes:number[]}{
  const hits=distances.map((d,i)=>[d,i] as const).filter(([d])=>d<threshold).sort((a,b)=>a[0]-b[0]).map(([,i])=>i);
  if(!hits.length)return {state:'NO_MATCH'};
  if(hits.length>MAX_CANDIDATES)return {state:'AMBIGUOUS'};
  return {state:'CANDIDATES',indexes:hits};
}

function distance(a:Float32Array,b:Float32Array){let sum=0;for(let i=0;i<a.length;i++){const d=a[i]!-b[i]!;sum+=d*d;}return Math.sqrt(sum);}

export function match(probe:Float32Array,gallery:Enrolled[]):FaceResult{
  const result=classify(gallery.map(g=>distance(probe,g.descriptor)));
  if(result.state!=='CANDIDATES')return result;
  return {state:'CANDIDATES',candidates:result.indexes.map(i=>{const {handle,label,patientId}=gallery[i]!;return {handle,label,patientId};})};
}

type FaceApi=typeof import('@vladmandic/face-api/dist/face-api.esm.js');
let loading:Promise<FaceApi>|null=null;
// Loads bundled model assets from /models once; a failure resets so the operator can retry.
export function loadModels():Promise<FaceApi>{
  loading??=(async()=>{
    const faceapi=await import('@vladmandic/face-api/dist/face-api.esm.js');
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri('/models'),faceapi.nets.faceLandmark68Net.loadFromUri('/models'),faceapi.nets.faceRecognitionNet.loadFromUri('/models')]);
    return faceapi;
  })().catch(e=>{loading=null;throw e;});
  return loading;
}

export async function describe(source:FaceSource):Promise<Float32Array>{
  const faceapi=await loadModels();
  const faces=await faceapi.detectAllFaces(source,new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:0.3})).withFaceLandmarks().withFaceDescriptors();
  if(!faces.length)throw new FaceInputError('No face found. Use a clear, front-facing image.');
  if(faces.length>1)throw new FaceInputError('More than one face found. Use an image with exactly one person.');
  return faces[0]!.descriptor;
}

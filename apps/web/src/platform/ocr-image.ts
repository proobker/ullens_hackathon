// Pure image steps for handwriting OCR: lighting normalisation, binarisation, skew estimate and
// line segmentation. Works on plain grayscale arrays so it runs in tests without a DOM.
export type Gray={data:Uint8Array;width:number;height:number};
export type Box={x:number;y:number;w:number;h:number};

export function toGray(rgba:Uint8ClampedArray|Uint8Array,width:number,height:number):Gray{
  const data=new Uint8Array(width*height);
  for(let i=0,p=0;p<data.length;i+=4,p++)data[p]=(0.299*rgba[i]!+0.587*rgba[i+1]!+0.114*rgba[i+2]!)|0;
  return {data,width,height};
}

// Divides out a coarse paper-brightness estimate (block maxima, smoothed) so shadows and uneven
// phone lighting stop looking like ink, then stretches contrast between the 1st and 99th percentiles.
export function normalize(g:Gray,block=32):Gray{
  const {data,width,height}=g,gw=Math.ceil(width/block),gh=Math.ceil(height/block),grid=new Float32Array(gw*gh);
  for(let by=0;by<gh;by++)for(let bx=0;bx<gw;bx++){
    let max=0;
    for(let y=by*block;y<Math.min(height,(by+1)*block);y++)for(let x=bx*block;x<Math.min(width,(bx+1)*block);x++){const v=data[y*width+x]!;if(v>max)max=v;}
    grid[by*gw+bx]=max;
  }
  // A block that is entirely ink has a dark "maximum"; smoothing with its neighbours' maxima recovers the paper level.
  const smooth=new Float32Array(gw*gh);
  for(let by=0;by<gh;by++)for(let bx=0;bx<gw;bx++){
    let best=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=bx+dx,y=by+dy;if(x>=0&&y>=0&&x<gw&&y<gh)best=Math.max(best,grid[y*gw+x]!);}
    smooth[by*gw+bx]=Math.max(1,best);
  }
  const out=new Uint8Array(width*height),hist=new Uint32Array(256);
  for(let y=0;y<height;y++){
    const fy=Math.min(gh-1,Math.max(0,y/block-0.5)),y0=Math.floor(fy),y1=Math.min(gh-1,y0+1),ty=fy-y0;
    for(let x=0;x<width;x++){
      const fx=Math.min(gw-1,Math.max(0,x/block-0.5)),x0=Math.floor(fx),x1=Math.min(gw-1,x0+1),tx=fx-x0;
      const bg=(smooth[y0*gw+x0]!*(1-tx)+smooth[y0*gw+x1]!*tx)*(1-ty)+(smooth[y1*gw+x0]!*(1-tx)+smooth[y1*gw+x1]!*tx)*ty;
      const v=Math.min(255,Math.round(data[y*width+x]!*255/bg));
      out[y*width+x]=v;hist[v]!++;
    }
  }
  const total=width*height;let lo=0,hi=255,acc=0;
  for(let v=0;v<256;v++){acc+=hist[v]!;if(acc>=total*0.01){lo=v;break;}}
  acc=0;for(let v=255;v>=0;v--){acc+=hist[v]!;if(acc>=total*0.01){hi=v;break;}}
  // Never stretch less than 64 levels: a blank or faint page must not have its paper grain amplified into ink.
  lo=Math.min(lo,hi-64);const range=hi-lo;
  for(let i=0;i<out.length;i++)out[i]=Math.max(0,Math.min(255,Math.round((out[i]!-lo)*255/range)));
  return {data:out,width,height};
}

export function otsu(g:Gray):number{
  const hist=new Float64Array(256);for(const v of g.data)hist[v]!++;
  const total=g.data.length;let sum=0;for(let v=0;v<256;v++)sum+=v*hist[v]!;
  let sumB=0,wB=0,best=0,threshold=128;
  for(let t=0;t<256;t++){
    wB+=hist[t]!;if(!wB)continue;const wF=total-wB;if(!wF)break;
    sumB+=t*hist[t]!;const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)**2;
    if(between>best){best=between;threshold=t;}
  }
  return threshold;
}

// 1 = ink. A nearly blank page has no real bimodality, so the threshold is capped well below paper white.
export function binarize(g:Gray,threshold=Math.min(otsu(g),200)):Uint8Array{
  const mask=new Uint8Array(g.data.length);
  for(let i=0;i<mask.length;i++)mask[i]=g.data[i]!<=threshold?1:0;
  return mask;
}

// Shear-projection skew estimate: the angle whose row profile has the highest variance is the one
// where text lines are horizontal. Returns degrees; positive means lines rise to the right.
export function estimateSkew(mask:Uint8Array,width:number,height:number,maxDeg=6,step=0.5):number{
  const sx=Math.max(1,Math.floor(width/600)),points:number[]=[];
  for(let y=0;y<height;y+=sx)for(let x=0;x<width;x+=sx)if(mask[y*width+x])points.push(x,y);
  if(points.length<40)return 0;
  let bestDeg=0,bestScore=-1;
  for(let deg=-maxDeg;deg<=maxDeg+1e-9;deg+=step){
    const t=Math.tan(deg*Math.PI/180),offset=Math.ceil(Math.abs(t)*width),rows=new Float64Array(Math.ceil((height+2*offset)/sx)+1);
    for(let i=0;i<points.length;i+=2)rows[Math.floor((points[i+1]!+points[i]!*t+offset)/sx)]!++;
    let s=0,s2=0;for(const r of rows){s+=r;s2+=r*r;}
    const score=s2-s*s/rows.length;
    if(score>bestScore+1e-6||(Math.abs(score-bestScore)<=1e-6&&Math.abs(deg)<Math.abs(bestDeg))){bestScore=score;bestDeg=deg;}
  }
  return bestDeg;
}

// Lower median: merged (touching) lines are the tall outliers, so ties resolve toward a single line height.
const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)/2)]!:0;};

// Median height of letter-sized ink blobs (8-connected components), ignoring specks and ruled lines.
// Approximates the writing's letter height, which sets how much the row profile must be smoothed.
export function letterHeight(mask:Uint8Array,width:number,height:number):number{
  const parent=new Int32Array(width*height).fill(-1),find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}return i;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!mask[i])continue;parent[i]=i;
    for(const j of [i-1,i-width-1,i-width,i-width+1]){
      if(j<0||(x===0&&(j===i-1||j===i-width-1))||(x===width-1&&j===i-width+1)||parent[j]===-1)continue;
      const a=find(i),b=find(j);if(a!==b)parent[a]=b;
    }
  }
  const top=new Map<number,number>(),bottom=new Map<number,number>(),left=new Map<number,number>(),right=new Map<number,number>(),area=new Map<number,number>();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(parent[i]===-1)continue;const r=find(i);
    if(!top.has(r)){top.set(r,y);left.set(r,x);right.set(r,x);}
    bottom.set(r,y);left.set(r,Math.min(left.get(r)!,x));right.set(r,Math.max(right.get(r)!,x));area.set(r,(area.get(r)??0)+1);
  }
  const heights:number[]=[];
  for(const [r,t] of top){const h=bottom.get(r)!-t+1,w=right.get(r)!-left.get(r)!+1;if(h>=4&&area.get(r)!>=10&&w<width*0.5)heights.push(h);}
  return median(heights);
}

// Finds handwritten text lines top-to-bottom from an ink mask. Ruled paper lines are removed first;
// touching lines (tall bands) are split at the weakest row of their middle section.
export function segmentLines(mask:Uint8Array,width:number,height:number,maxLines=40):Box[]{
  const rowInk=new Float64Array(height);
  for(let y=0;y<height;y++){let c=0;for(let x=0;x<width;x++)c+=mask[y*width+x]!;rowInk[y]=c;}
  // Ruled lines: thin runs (≤4 rows) where most of the width is ink.
  for(let y=0;y<height;){
    if(rowInk[y]!>width*0.6){let end=y;while(end<height&&rowInk[end]!>width*0.6)end++;if(end-y<=4)for(let r=y;r<end;r++)rowInk[r]=0;y=end;}
    else y++;
  }
  // Smooth over ~0.4 letter heights: closes gaps between a line's ascenders, x-height and descenders
  // (thin strokes leave them once the page is deskewed) but not the larger gaps between lines.
  const radius=Math.max(1,Math.round(letterHeight(mask,width,height)*0.4)),smooth=new Float64Array(height);
  for(let y=0;y<height;y++){let sum=0,n=0;for(let k=Math.max(0,y-radius);k<=Math.min(height-1,y+radius);k++){sum+=rowInk[k]!;n++;}smooth[y]=sum/n;}
  const nonzero=[...smooth].filter(v=>v>0).sort((a,b)=>a-b);
  if(!nonzero.length)return [];
  const threshold=Math.max(1,0.08*nonzero[Math.floor(nonzero.length*0.9)]!);
  let bands:{top:number;bottom:number}[]=[];
  for(let y=0;y<height;){
    if(smooth[y]!>threshold){let end=y;while(end<height&&smooth[end]!>threshold)end++;bands.push({top:y,bottom:end});y=end;}
    else y++;
  }
  if(!bands.length)return [];
  let mh=median(bands.map(b=>b.bottom-b.top));
  // Rejoin dots, accents and broken strokes separated from their line by a small gap.
  const merged:typeof bands=[];
  for(const b of bands){
    const last=merged.at(-1);
    if(last&&b.top-last.bottom<0.35*mh&&Math.min(b.bottom-b.top,last.bottom-last.top)<0.6*mh)last.bottom=b.bottom;
    else merged.push({...b});
  }
  bands=merged;
  // Smoothing widens every band by about the radius; trim back to rows that actually carry ink so
  // band heights stay comparable (a merged pair of lines must still look twice as tall).
  for(const b of bands){while(b.top<b.bottom-1&&rowInk[b.top]!<threshold)b.top++;while(b.bottom-1>b.top&&rowInk[b.bottom-1]!<threshold)b.bottom--;}
  mh=median(bands.map(b=>b.bottom-b.top));
  const split:typeof bands=[];
  for(const b of bands){
    const h=b.bottom-b.top,parts=Math.round(h/mh);
    if(parts>=2&&h>1.7*mh){
      let start=b.top;
      for(let k=1;k<parts;k++){
        const centre=b.top+Math.round(h*k/parts),lo=Math.max(start+1,centre-Math.round(mh*0.4)),hi=Math.min(b.bottom-1,centre+Math.round(mh*0.4));
        let cut=centre,min=Infinity;for(let y=lo;y<=hi;y++)if(rowInk[y]!<min){min=rowInk[y]!;cut=y;}
        // Two touching lines have two dense cores with a dip between; a heavy descender is one core and a faint tail.
        let above=0,below=0;for(let y=start;y<cut;y++)above=Math.max(above,rowInk[y]!);for(let y=cut;y<b.bottom;y++)below=Math.max(below,rowInk[y]!);
        if(Math.min(above,below)<0.5*Math.max(above,below)||min>0.5*Math.min(above,below))continue;
        split.push({top:start,bottom:cut});start=cut;
      }
      split.push({top:start,bottom:b.bottom});
    }else split.push(b);
  }
  const boxes:Box[]=[];
  for(const b of split){
    const h=b.bottom-b.top;if(h<Math.max(3,0.3*mh))continue;
    const colInk=new Uint32Array(width);let ink=0;
    for(let y=b.top;y<b.bottom;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){colInk[x]!++;ink++;}
    if(ink<Math.max(12,h*1.5))continue;
    let left=0,right=width-1;while(left<width&&!colInk[left])left++;while(right>left&&!colInk[right])right--;
    const padY=Math.round(h*0.25),padX=Math.round(h*0.5),top=Math.max(0,b.top-padY),x=Math.max(0,left-padX);
    boxes.push({x,y:top,w:Math.min(width,right+1+padX)-x,h:Math.min(height,b.bottom+padY)-top});
    if(boxes.length>=maxLines)break;
  }
  return boxes;
}

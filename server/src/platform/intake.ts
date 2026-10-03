import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { digest, type PlatformStore, type Profile, type Staff } from './store.js';
import { EntrySchema } from '@pran-rekha/contracts/platform';
type Document={id:string;patientId:string;hash:string;mime:string;title:string;base64:string;pages:string[];status:string;createdAt:string};
export function intakeRouter(store:PlatformStore,clock:()=>Date){
  const router=Router();
  function own(actor:string,pid:string){if(!store.db.prepare('SELECT 1 FROM actor_patient_bindings WHERE actor_id=? AND patient_id=?').get(actor,pid))throw new Error('FORBIDDEN');}
  router.post('/profiles/:id/documents',async(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,pid=String(req.params.id);own(s.id,pid);
      const input=z.object({requestId:z.string().min(1),title:z.string().min(1).max(200),base64:z.string().max(14*1024*1024)}).strict().parse(req.body);
      const bytes=Buffer.from(input.base64,'base64');if(bytes.length>10*1024*1024||bytes.length===0)throw new Error('INVALID_INPUT');
      const hash=digest(bytes.toString('base64'));
      const existing=store.all<Document>('document').find(d=>d.patientId===pid&&d.hash===hash);
      if(existing){res.json({id:existing.id,duplicate:true,status:existing.status});return;}
      if(store.all<Document>('document').filter(d=>d.patientId===pid).length>=10)throw new Error('INVALID_INPUT');
      let mime:string,pages:string[];
      if(bytes.subarray(0,5).toString()==='%PDF-'){
        if(/\/(JavaScript|JS|Launch|EmbeddedFiles|OpenAction|AA)\b/.test(bytes.toString('latin1')))throw new Error('INVALID_INPUT');
        const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
        const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});
        const pdf=await task.promise;
        try{
          if(pdf.numPages>10)throw new Error('INVALID_INPUT');pages=[];
          for(let page=1;page<=pdf.numPages;page++){
            const p=await pdf.getPage(page);const content=await p.getTextContent();
            pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));
          }
        }finally{await task.destroy();}
        mime='application/pdf';
      }else{
        const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
        if(!png&&!jpeg)throw new Error('INVALID_INPUT');
        const {default:sharp}=await import('sharp');
        await sharp(bytes,{limitInputPixels:40000000}).metadata();
        mime=png?'image/png':'image/jpeg';pages=[''];
      }
      const result=store.mutate(s.id,input.requestId,{pid,hash,title:input.title},()=>{
        const doc:Document={id:randomUUID(),patientId:pid,hash,mime,title:input.title,base64:input.base64,pages,status:pages.some(Boolean)?'NEEDS_CONFIRMATION':'MANUAL_ANNOTATION',createdAt:clock().toISOString()};
        store.put('document',doc.id,doc);return {id:doc.id,duplicate:false,status:doc.status};
      });res.json(result);
    }catch(e){next(e);}
  });
  router.get('/profiles/:id/documents',(req,res,next)=>{
    try{const s=res.locals.staff as Staff,pid=String(req.params.id);own(s.id,pid);
      res.json(store.all<Document>('document').filter(d=>d.patientId===pid).map(({base64,...d})=>d));
    }catch(e){next(e);}
  });
  router.get('/documents/:id/original',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,doc=store.get<Document>('document',String(req.params.id));
      if(!doc)throw new Error('FORBIDDEN');own(s.id,doc.patientId);
      res.setHeader('Content-Type',doc.mime);res.setHeader('Content-Disposition','attachment; filename="source-document"');res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
      res.send(Buffer.from(doc.base64,'base64'));
    }catch(e){next(e);}
  });
  router.post('/documents/:id/confirm',(req,res,next)=>{
    try{
      const s=res.locals.staff as Staff,doc=store.get<Document>('document',String(req.params.id));
      if(!doc)throw new Error('FORBIDDEN');own(s.id,doc.patientId);
      const input=z.object({requestId:z.string().min(1),expectedRevision:z.number().int(),page:z.number().int().positive(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),text:z.string().min(1).max(2000),date:z.iso.date(),kind:EntrySchema.shape.kind}).strict().parse(req.body);
      if(input.page>doc.pages.length)throw new Error('INVALID_INPUT');
      const extraction=doc.pages[input.page-1]!;
      if(extraction&&(input.end>extraction.length||input.end<=input.start))throw new Error('INVALID_INPUT');
      // Image-only intake records a separate attributed transcription, never fabricated OCR.
      const excerpt=extraction?extraction.slice(input.start,input.end):input.text;
      const result=store.mutate(s.id,input.requestId,{documentId:doc.id,...input},()=>{
        const p=store.get<Profile>('profile',doc.patientId);if(!p)throw new Error('FORBIDDEN');
        if(p.revision!==input.expectedRevision)throw new Error('CONFLICT');
        const entry={id:randomUUID(),kind:input.kind,text:input.text,date:input.date,source:doc.title+' · page '+input.page+(extraction?'':' · patient transcription'),excerpt,author:s.id,reviewed:false};
        p.entries.push(entry);p.revision++;store.put('profile',p.id,p);
        store.put('source-reference',entry.id,{documentId:doc.id,hash:doc.hash,page:input.page,start:input.start,end:input.end,mode:extraction?'text':'manual_transcription'});
        return entry;
      });res.json(result);
    }catch(e){next(e);}
  });
  return router;
}

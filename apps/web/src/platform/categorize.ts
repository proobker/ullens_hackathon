import type { Entry } from '@pran-rekha/contracts/platform';
import { correctLine } from './medical-lexicon';
// Keyword rules that propose a record category for one recognized line. Order matters: first match wins.
// null means uncategorized; the clinician must choose before signing.
const rules:[Entry['kind'],RegExp][]=[
  ['allergy',/allerg|anaphyla|reaction to|intoleran/i],
  ['blood_group',/blood\s*group|^\s*(A|B|AB|O)\s*(\+|-|pos|neg)\s*$|\b(A|B|AB|O)\s*(\+|-)(?=\s|$)/i],
  ['vital',/\b(bp|blood pressure|pulse|hr|heart rate|spo2|sp02|temp|temperature|rr|resp(iratory)? rate)\b|\b\d{2,3}\/\d{2,3}\s*mm\s*hg\b/i],
  ['implant',/implant|pacemaker|stent|prosthe/i],
  ['medication',/\b\d+(\.\d+)?\s*(mg|mcg|µg|ml|g|iu|units?)\b|\b(tab|tabs|tablet|cap|caps|capsule|syr|syrup|inj|injection|od|bd|bid|tds|tid|qid|hs|prn|sos|stat)\b|\b[01]\s*-\s*[01]\s*-\s*[01]\b|^\s*rx\b/i],
  ['condition',/diagnos|\bdx\b|\bh\/o\b|history of|diabet|hypertens|\bhtn\b|asthma|copd|\bckd\b|epilep|thyroid/i],
];
export function categorize(line:string):Entry['kind']|null{
  for(const [kind,re] of rules)if(re.test(line))return kind;
  return null;
}
// original = raw OCR line (kept as the signed excerpt); text = lexicon-corrected, editable by the clinician.
export type Candidate={id:string;original:string;text:string;kind:Entry['kind']|null;confidence:number;include:boolean;corrections?:string[];alternative?:string};
export const LOW_CONFIDENCE=60;
export function toCandidates(lines:{text:string;confidence:number;alternative?:string}[]):Candidate[]{
  return lines.map(l=>({...l,text:l.text.replace(/\s+/g,' ').trim()}))
    .filter(l=>l.text.replace(/[^\p{L}\p{N}]/gu,'').length>=3)
    .map((l,i)=>{const fixed=correctLine(l.text);return {id:'line-'+i,original:l.text,text:fixed.text,kind:categorize(fixed.text),confidence:l.confidence,include:true,corrections:fixed.changed,...(l.alternative?{alternative:l.alternative}:{})};});
}

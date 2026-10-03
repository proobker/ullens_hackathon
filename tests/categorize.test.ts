import { expect, it } from 'vitest';
import { categorize, toCandidates } from '../apps/web/src/platform/categorize';
it('proposes record categories for recognized lines',()=>{
  expect(categorize('Tab Paracetamol 500mg 1-0-1')).toBe('medication');
  expect(categorize('Amoxicillin 250 mg BD x 5 days')).toBe('medication');
  expect(categorize('Allergy: sulfa drugs')).toBe('allergy');
  expect(categorize('BP 130/85 mmHg')).toBe('vital');
  expect(categorize('Pulse 82')).toBe('vital');
  expect(categorize('Dx: Type 2 diabetes')).toBe('condition');
  expect(categorize('B+')).toBe('blood_group');
  expect(categorize('Blood group O-')).toBe('blood_group');
  expect(categorize('Cardiac stent 2019')).toBe('implant');
  expect(categorize('Follow up in 2 weeks')).toBeNull();
});
it('drops noise lines and keeps the original text for review',()=>{
  const c=toCandidates([{text:'  Tab  Amoxicillin 500mg BD ',confidence:91},{text:'~ .',confidence:12},{text:'Allergy: Penicillin',confidence:40}]);
  expect(c.map(x=>[x.original,x.kind,x.confidence])).toEqual([['Tab Amoxicillin 500mg BD','medication',91],['Allergy: Penicillin','allergy',40]]);
  expect(c.map(x=>x.text)).toEqual(['Tab Amoxicillin 500 mg BD','Allergy: Penicillin']);
  expect(c.every(x=>x.include)).toBe(true);
});
it('keeps the raw OCR line but proposes the dictionary-corrected text and category',()=>{
  const [c]=toCandidates([{text:'Amoxycilin 5OO rng 1-O-1',confidence:48}]);
  expect(c).toMatchObject({original:'Amoxycilin 5OO rng 1-O-1',text:'Amoxicillin 500 mg 1-0-1',kind:'medication'});
  expect(c!.corrections).toContain('Amoxycilin→Amoxicillin');
});

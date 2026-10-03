import { expect, it } from 'vitest';
import { classify, match, type Enrolled } from '../apps/web/src/platform/face';
const vec=(x:number)=>new Float32Array([x,0,0]);
const person=(n:number,x:number):Enrolled=>({handle:'h'+n,label:'P'+n,patientId:'PR-9042-8819',descriptor:vec(x)});
it('classifies distances into candidate-only states',()=>{
  expect(classify([0.9,0.7])).toEqual({state:'NO_MATCH'});
  expect(classify([0.4,0.9,0.2])).toEqual({state:'CANDIDATES',indexes:[2,0]});
  expect(classify([0.1,0.2,0.3,0.4])).toEqual({state:'AMBIGUOUS'});
});
it('returns handles and labels only, never distances',()=>{
  const result=match(vec(0),[person(1,0.1),person(2,2)]);
  expect(result).toEqual({state:'CANDIDATES',candidates:[{handle:'h1',label:'P1',patientId:'PR-9042-8819'}]});
  expect(JSON.stringify(result)).not.toMatch(/\d\.\d/);
  expect(match(vec(0),[])).toEqual({state:'NO_MATCH'});
});

import { expect, it } from 'vitest';
import { correctLine, editDistance, plausibility } from '../apps/web/src/platform/medical-lexicon';

it('fixes misread drug names, doses and units', () => {
  expect(correctLine('Amoxycilin 5OO rng BD').text).toBe('Amoxicillin 500 mg BD');
  expect(correctLine('Paracetmol 1-O-1').text).toBe('Paracetamol 1-0-1');
  expect(correctLine('tab metfromin 500mg b.d.').text).toBe('Tab Metformin 500 mg BD');
  expect(correctLine('Atorvastatn l0 mg HS').text).toBe('Atorvastatin 10 mg HS');
  expect(correctLine('Amlodipine 5 mg OD').changed).toEqual([]);
});

it('repairs misreads seen from the handwriting engines', () => {
  expect(correctLine('Tab Amoxicillin 500 mg.BD').text).toBe('Tab Amoxicillin 500 mg BD');
  expect(correctLine('Paracetamol650 mg (-O-I.').text).toBe('Paracetamol 650 mg 1-0-1');
  expect(correctLine('BP 130 (85 mmfkg.').text).toBe('BP 130/85 mmHg');
  expect(correctLine('BB 130/85 mmsty').text).toBe('BP 130/85 mmHg');
  expect(correctLine('Tab Amoxicillin Soo mq BD').text).toBe('Tab Amoxicillin 500 mg BD');
  expect(correctLine('Jah. Amopicillin 500 mg.BD.').text).toBe('Tab Amoxicillin 500 mg BD');
  expect(correctLine('Fab Amoxicillin 500 mg').text).toBe('Tab Amoxicillin 500 mg');
  expect(correctLine('Alergy: Peniecllin').text).toBe('Allergy: Penicillin');
});

it('scores real prescription text above engine noise', () => {
  expect(plausibility('Tab Amoxicillin 500 mg BD')).toBeGreaterThan(0.9);
  expect(plausibility('What links hereRelated changesUpload file')).toBeLessThan(plausibility('Paracetamol 650 mm 1-0-1'));
  expect(plausibility('Fab Amspitillin soo ry £9')).toBeLessThan(plausibility('Tab Amoxicillin 500 mg BD'));
  expect(plausibility('Paracetamol 650 mg 4-0-1')).toBeLessThan(plausibility('Paracetamol 650 mg 1-0-1'));
  expect(correctLine('Tab-Amoxicillin 500 mg').text).toBe('Tab Amoxicillin 500 mg');
});

it('reports each correction for the reviewer', () => {
  expect(correctLine('Amoxycilin 5OO rng').changed).toEqual(['5OO rng→500 mg', 'Amoxycilin→Amoxicillin']);
});

it('leaves ordinary words and short tokens alone', () => {
  expect(correctLine('Follow up in 2 weeks').text).toBe('Follow up in 2 weeks');
  expect(correctLine('Allergy: Penicillin').text).toBe('Allergy: Penicillin');
  expect(correctLine('BP 130/85 mmHg').text).toBe('BP 130/85 mmHg');
  expect(correctLine('Pain after food').changed).toEqual([]);
  expect(correctLine('Ok').text).toBe('Ok');
});

it('measures transpositions as one edit', () => {
  expect(editDistance('paracetmaol', 'paracetamol')).toBe(1);
});

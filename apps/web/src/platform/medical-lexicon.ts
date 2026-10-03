// Post-OCR correction for prescriptions: fixes digit/letter confusions in doses and units, and snaps
// near-miss words to common generic drug names. Output is still a candidate the clinician confirms.

// Common generics (WHO essential medicines + frequent Nepal OPD prescriptions). Spelling here is the output form.
const DRUGS = `Acetazolamide Aciclovir Acyclovir Adrenaline Albendazole Allopurinol Alprazolam Amiodarone Amitriptyline Amlodipine
Amoxicillin Amoxiclav Ampicillin Aspirin Atenolol Atorvastatin Atropine Azithromycin Baclofen Beclomethasone Betahistine
Betamethasone Bisacodyl Bisoprolol Budesonide Bupivacaine Calamine Calcitriol Calcium Captopril Carbamazepine Carvedilol
Cefadroxil Cefixime Cefpodoxime Ceftriaxone Cefuroxime Cephalexin Cetirizine Chloramphenicol Chloroquine Chlorpheniramine
Chlorpromazine Chlorhexidine Cholecalciferol Cinnarizine Ciprofloxacin Citalopram Clarithromycin Clindamycin Clobetasol
Clonazepam Clonidine Clopidogrel Clotrimazole Cloxacillin Codeine Colchicine Cotrimoxazole Cyproheptadine Dapagliflozin
Deferasirox Dexamethasone Dextromethorphan Diazepam Diclofenac Dicyclomine Digoxin Diltiazem Diphenhydramine Domperidone
Donepezil Doxycycline Duloxetine Empagliflozin Enalapril Enoxaparin Entecavir Erythromycin Escitalopram Esomeprazole
Ethambutol Etoricoxib Famotidine Febuxostat Fenofibrate Ferrous Fexofenadine Finasteride Fluconazole Fluoxetine Fluticasone
Folic Furosemide Gabapentin Gentamicin Glibenclamide Gliclazide Glimepiride Glipizide Glyceryl Haloperidol Heparin
Hydralazine Hydrochlorothiazide Hydrocortisone Hydroxychloroquine Hydroxyzine Hyoscine Ibuprofen Indomethacin Insulin
Ipratropium Irbesartan Iron Isoniazid Isosorbide Itraconazole Ivermectin Ketoconazole Ketorolac Labetalol Lactulose
Lamotrigine Lansoprazole Levetiracetam Levocetirizine Levofloxacin Levothyroxine Lidocaine Linagliptin Linezolid
Lisinopril Loperamide Loratadine Lorazepam Losartan Magnesium Mebendazole Mefenamic Meloxicam Metformin Methotrexate
Methyldopa Methylprednisolone Metoclopramide Metoprolol Metronidazole Miconazole Midazolam Mirtazapine Montelukast
Morphine Moxifloxacin Multivitamin Mupirocin Naproxen Nebivolol Neomycin Nifedipine Nitrofurantoin Nitroglycerin
Norfloxacin Nystatin Ofloxacin Olanzapine Olmesartan Omeprazole Ondansetron Oseltamivir Oxytocin Pantoprazole Paracetamol
Penicillin Permethrin Phenobarbital Phenytoin Pioglitazone Piroxicam Potassium Pramipexole Pravastatin Praziquantel
Prednisolone Prednisone Pregabalin Primaquine Prochlorperazine Promethazine Propranolol Pyrazinamide Pyridoxine Quetiapine
Rabeprazole Ramipril Ranitidine Rifampicin Risperidone Rosuvastatin Salbutamol Salmeterol Sertraline Sildenafil Simvastatin
Sitagliptin Sodium Spironolactone Sucralfate Sulfasalazine Sumatriptan Tamsulosin Telmisartan Tenofovir Terbinafine
Theophylline Thiamine Tinidazole Tiotropium Tramadol Tranexamic Trimethoprim Ursodeoxycholic Valproate Valsartan
Vancomycin Verapamil Vildagliptin Vitamin Warfarin Zinc Zolpidem`.split(/\s+/);

// Clinical words worth snapping to (Alergy → Allergy), in their output spelling.
const CLINICAL = `Allergy Allergic Reaction History Diagnosis Diabetes Hypertension Asthma Thyroid Pressure Blood Group Pulse
Temperature Sugar Fasting Stent Implant Pacemaker Tablet Tablets Capsule Capsules Syrup Drops Cream Ointment Injection
Inhaler Daily Morning Night Evening Before After Meals Weeks Months Review Continue`.split(/\s+/);

// Everyday words that must never be "corrected" into a drug or clinical word.
const COMMON = new Set(`with without take food days when needed until stop start dose units drug drugs sulfa tabs caps pain fever
cough cold vomiting nausea headache patient doctor hospital clinic times once twice thrice follow kidney liver heart random
that this then them they what have from your more less same each over under very also only into onto upon`.split(/\s+/));

const ABBREVIATIONS: Record<string, string> = {
  od: 'OD', bd: 'BD', bid: 'BID', tds: 'TDS', tid: 'TID', qid: 'QID', hs: 'HS', sos: 'SOS', prn: 'PRN', stat: 'STAT',
  tab: 'Tab', tabs: 'Tabs', cap: 'Cap', caps: 'Caps', syr: 'Syr', inj: 'Inj', rx: 'Rx', dx: 'Dx', bp: 'BP',
};
const FORMS = ['Tab', 'Cap', 'Syr', 'Inj'];
const UNITS = new Set(['mg', 'mcg', 'ml', 'g', 'iu', 'mmhg', 'units', 'x', 'kg', '%']);

const drugs = new Map(DRUGS.map(d => [d.toLowerCase(), d]));
const vocabulary = new Map([...CLINICAL.map(w => [w.toLowerCase(), w] as const), ...drugs]);

// Optimal string alignment distance (Levenshtein + adjacent transposition), case-insensitive input expected.
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
  }
  return d[a.length]![b.length]!;
}

// Closest vocabulary word within ~a third of its length. Ties prefer the candidate of equal length
// (OCR mostly substitutes letters); a remaining tie keeps the original rather than guess.
function nearestWord(word: string): string | null {
  const lower = word.toLowerCase();
  const exact = vocabulary.get(lower);
  if (exact) return exact;
  if (COMMON.has(lower) || lower.length < 4) return null;
  const limit = lower.length <= 5 ? 1 : Math.floor(lower.length * 0.34);
  let best: string | null = null, bestDistance = Infinity, bestGap = Infinity, tie = false;
  for (const [key, out] of vocabulary) {
    const gap = Math.abs(key.length - lower.length);
    if (gap > limit) continue;
    const distance = editDistance(lower, key);
    if (distance < bestDistance || (distance === bestDistance && gap < bestGap)) { best = out; bestDistance = distance; bestGap = gap; tie = false; }
    else if (distance === bestDistance && gap === bestGap && out !== best) tie = true;
  }
  return best && bestDistance <= limit && !tie ? best : null;
}

const digitLike = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il|(!\]i]/g, '1').replace(/[Ss]/g, '5');
const unitFor = (u: string) => /^(mcg|mcq|meg)$/i.test(u) ? 'mcg' : /^(ml|rnl)$/i.test(u) || u === 'mI' ? 'ml' : 'mg';

export function correctLine(input: string): { text: string; changed: string[] } {
  const changed: string[] = [];
  const note = (from: string, to: string) => { if (from.trim() !== to.trim()) changed.push(`${from.trim()}→${to.trim()}`); return to; };
  // Stray punctuation at the ends, and glued words/numbers (Paracetamol650, mg.BD).
  let text = input.replace(/^[\s.,;:'"`~\-_]+|[\s.,;:'"`~\-_]+$/g, '').replace(/([A-Za-z]{3,})(\d)/g, '$1 $2').replace(/([a-z])\.(?=[A-Z]{2,}\b)/g, '$1 ').replace(/([A-Za-z])-(?=[A-Za-z]{3,})/g, '$1 ');
  // Dosing pattern like 1-0-1 written or read with look-alikes (l-O-l, (-O-I).
  text = text.replace(/(?<![\w])([01OoIil|(!\]])\s*[-–—]\s*([01OoIil|(!\]])\s*[-–—]\s*([01OoIil|(!\]])(?![\w])/g, m => note(m, digitLike(m).replace(/\s*[-–—]\s*/g, '-')));
  // A number-like token followed by a unit-like token: 5OO rng, Soo mq → 500 mg.
  text = text.replace(/(?<![\w.])([0-9OoSsIl|]{1,5}(?:\.[0-9Oo]+)?)\s*(mg|mq|rng|rnq|nig|m9|mgs|mcg|mcq|meg|ml|rnl|mI)(?![a-z])/gi,
    (m, n: string, u: string) => (/\d/.test(n) || /^[Ss][Oo0]{1,3}$/.test(n)) ? note(m, `${digitLike(n)} ${unitFor(u)}`) : m);
  // Remaining numbers with letter look-alikes: 5OO, l0.
  text = text.replace(/(?<![\w.])(?=[0-9OoIlSs|]*\d)[0-9OoIlSs|]{2,}(?:\.[0-9Oo]+)?(?![\w])/g, m => note(m, digitLike(m)));
  text = text.replace(/(\d)(mg|mcg|ml|g|iu)\b/gi, (_m, d: string, u: string) => `${d} ${u.toLowerCase()}`);
  // Blood pressure: 130 (85 → 130/85, BB 130/85 → BP, and a short word after the ratio is mmHg.
  text = text.replace(/\b(\d{2,3})\s?[(|\\]\s?(\d{2,3})\b/g, (m, a: string, b: string) => note(m, `${a}/${b}`));
  text = text.replace(/^[A-Z8]{2}(?=\s*\d{2,3}\s*\/\s*\d{2,3})/, m => m === 'BP' ? m : note(m, 'BP'));
  text = text.replace(/(\d{2,3}\s*\/\s*\d{2,3})\s*([A-Za-z]{2,6})\b/, (m, ratio: string, unit: string) => /^mmhg$/i.test(unit) ? `${ratio} mmHg` : note(m, `${ratio} mmHg`));
  // Dotted abbreviations: B.D. → BD, t.d.s → TDS.
  text = text.replace(/\b([a-z])\.\s?([a-z])\.?(?:\s?([a-z])\.?)?(?=\s|$)/gi, (m, a: string, b: string, c?: string) => {
    const key = (a + b + (c ?? '')).toLowerCase();
    return ABBREVIATIONS[key] ? note(m, ABBREVIATIONS[key]) : m;
  });
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i++) {
    const core = /^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/.exec(words[i]!);
    if (!core) continue;
    const [, pre, word, post] = core as unknown as [string, string, string, string];
    const fixed = ABBREVIATIONS[word.toLowerCase()] ?? nearestWord(word);
    if (!fixed) continue;
    // Exact matches only take canonical casing for drugs and abbreviations; other words keep the writer's casing.
    const same = fixed.toLowerCase() === word.toLowerCase();
    words[i] = pre + (same ? (drugs.has(word.toLowerCase()) || ABBREVIATIONS[word.toLowerCase()] ? fixed : word) : note(word, fixed)) + post;
  }
  // A short garbled first word before a drug name is almost always the dosage form (Fab → Tab).
  const first = words[0] ?? '', bare = first.replace(/\.$/, '').toLowerCase(), next = words.slice(1).find(w => w.trim());
  if (/^[a-z]{2,4}$/.test(bare) && !ABBREVIATIONS[bare] && next && drugs.has(next.replace(/[^A-Za-z]/g, '').toLowerCase())) {
    const [form, distance] = FORMS.map(f => [f, editDistance(bare, f.toLowerCase())] as const).sort((a, b) => a[1] - b[1])[0]!;
    if (distance <= 2) words[0] = note(first, form);
  }
  return { text: words.join('').replace(/\s+/g, ' ').trim(), changed };
}

// Share of a line's tokens that read as real prescription content (known words, numbers, units,
// abbreviations), minus a penalty for junk symbols. Used to choose between two engines' readings.
export function plausibility(text: string): number {
  const tokens = text.split(/\s+/).map(t => t.replace(/^[^\w%]+|[^\w%]+$/g, '')).filter(Boolean);
  if (!tokens.length) return 0;
  let good = 0;
  for (const t of tokens) {
    const lower = t.toLowerCase();
    // Dosing grids (morning-noon-night) only use 0, 1, 2 or ½; anything else is probably a misread digit.
    if (/^\d+-\d+-\d+$/.test(t)) good += /^[012½]-[012½]-[012½]$/.test(t) ? 1 : 0.3;
    else if (vocabulary.has(lower) || COMMON.has(lower) || ABBREVIATIONS[lower] || UNITS.has(lower) || /^\d+([./]\d+)*$/.test(t)) good++;
    else if (/^[a-z]{3,}$/i.test(t) && !/[^aeiouy]{5}/i.test(t)) good += 0.4; // pronounceable but unknown
  }
  const junk = (text.match(/[^\w\s.,:/%+()-]/g) ?? []).length / Math.max(1, text.length);
  return Math.max(0, good / tokens.length - junk * 2);
}

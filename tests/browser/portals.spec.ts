import { test,expect,type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
// Single-face crop of the face-api package's demo photo, made in-page so no face image is committed to the repo.
async function faceCrop(page:Page){
  const src='data:image/jpeg;base64,'+readFileSync('node_modules/@vladmandic/face-api/demo/sample1.jpg').toString('base64');
  const data=await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=380;c.height=380;c.getContext('2d')!.drawImage(img,330,330,380,380,0,0,380,380);return c.toDataURL('image/jpeg',0.92).split(',')[1]!;},src);
  return {name:'face.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data,'base64')};
}
test('patient portal, responsive source evidence and role isolation',async({page})=>{
  await page.goto('/patient');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Siddharth Raj Sharma',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/patient-desktop.png',fullPage:true});
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/patient-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Source',exact:true}).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('link',{name:'Lab',exact:true}).click();
  await expect(page.getByText('This account has no access to this portal.')).toBeVisible();
});
test('unprepared offline browser fails explicitly',async({page})=>{
  await page.goto('/patient');
  await page.getByLabel(/Unlock phrase/).fill('long synthetic phrase');
  await page.getByRole('button',{name:'Unlock saved snapshot'}).click();
  await expect(page.getByRole('alert').filter({hasText:'No prepared snapshot'})).toBeVisible();
});
test('prepared patient viewer reloads offline and records access before display',async({page,context})=>{
  await page.goto('/patient');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Siddharth Raj Sharma',{exact:true})).toBeVisible();
  await page.getByLabel(/Unlock phrase/).fill('synthetic offline phrase');
  await page.getByRole('button',{name:'Prepare offline copy',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Encrypted snapshot prepared'})).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel(/Unlock phrase/).fill('synthetic offline phrase');
  await page.getByRole('button',{name:'Unlock saved snapshot'}).click();
  await expect(page.getByText(/Offline snapshot from/)).toBeVisible();
  expect(await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('pran-rekha-offline');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return await new Promise<number>((resolve,reject)=>{const r=db.transaction('receipts').objectStore('receipts').count();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);});
  })).toBeGreaterThan(0);
});
test('hospital face lookup stays disabled until consent',async({page})=>{
  await page.goto('/hospital');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Possible patient lookup'})).toBeVisible();
  await expect(page.locator('.face-lookup').getByRole('button',{name:'Use camera'})).toBeDisabled();
  await page.getByLabel('Consent to face candidate matching for this image').check();
  await expect(page.locator('.face-lookup').getByRole('button',{name:'Use camera'})).toBeEnabled({timeout:30000});
});
test('hospital registers a patient who can then sign in to the patient portal',async({page})=>{
  const username='pw'+Date.now().toString(36);
  await page.goto('/hospital');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Full name').fill('Test Patient');
  await page.getByLabel('Date of birth').fill('1990-01-15');
  await page.getByLabel('Blood group').selectOption('A+');
  await page.getByLabel('Patient username').fill(username);
  await page.getByLabel('Initial password').fill('synthetic-pass-1');
  await page.getByLabel(/Synthetic demonstration data only/).check();
  const register=page.getByRole('button',{name:'Register patient'});
  // A face photo is optional and may be enrolled later.
  await expect(register).toBeEnabled();
  await page.locator('.register-photo input[type=file]').setInputFiles(await faceCrop(page));
  await expect(page.getByText('One face detected.',{exact:false})).toBeVisible({timeout:60000});
  await expect(register).toBeDisabled();
  await page.getByLabel(/consents to storing this face photo/).check();
  await expect(register).toBeEnabled();
  await register.click();
  const result=page.locator('.register-result');
  await expect(result.getByText(/^PR-\d{4}-\d{4}$/)).toBeVisible();
  const pid=await result.locator('.pass-id').innerText();
  const lookup=page.locator('.face-lookup');
  await lookup.getByLabel('Consent to face candidate matching for this image').check();
  await expect(lookup.getByText(/Registered faces: [1-9]/)).toBeVisible({timeout:60000});
  await lookup.locator('input[type=file]').setInputFiles(await faceCrop(page));
  await expect(lookup.locator('.face-candidates').getByText('Test Patient · '+pid+' · registered')).toBeVisible({timeout:60000});
  await expect(lookup.getByRole('img',{name:'Registered photo of Test Patient'}).first()).toBeVisible();
  await page.getByRole('button',{name:/Sign out/}).click();
  await page.goto('/patient');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('synthetic-pass-1');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Test Patient',{exact:true})).toBeVisible();
  await expect(page.getByText(pid,{exact:true})).toBeVisible();
});
test('theme defaults to light and persists the user choice across pages and reloads',async({page})=>{
  const bg=()=>page.locator('.platform').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.goto('/hospital');
  expect(await page.locator('html').getAttribute('data-theme')).toBeNull();
  expect(await bg()).toBe('rgb(248, 250, 252)');
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await bg()).toBe('rgb(15, 23, 42)');
  await page.goto('/patient');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();
  await expect(page.getByRole('button',{name:'Switch to light mode'})).toBeVisible();
  expect(await bg()).toBe('rgb(15, 23, 42)');
  await page.getByRole('button',{name:'Switch to light mode'}).click();
  expect(await bg()).toBe('rgb(248, 250, 252)');
});
test('lab reads a handwritten-style note locally, categorizes lines and signs after review',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/lab');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const panel=page.locator('.handwritten');
  await expect(panel.getByRole('heading',{name:/Handwritten prescription/})).toBeVisible();
  // Pin the bundled Tesseract engine so the test is offline and deterministic (TrOCR downloads ~64 MB on first use).
  await page.evaluate(()=>localStorage.setItem('pran-ocr-engine','tesseract'));
  // Synthetic note drawn in-page (print-style, as Tesseract handles block handwriting far better than cursive).
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=260;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,900,260);x.fillStyle='#111';x.font='40px sans-serif';
    x.fillText('Tab Amoxicillin 500mg BD',40,80);x.fillText('Allergy: Penicillin',40,150);x.fillText('BP 130/85 mmHg',40,220);return c.toDataURL('image/jpeg',0.95).split(',')[1]!;});
  await panel.locator('input[type=file]').setInputFiles({name:'note.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data,'base64')});
  await expect(panel.getByText(/line\(s\) recognized/)).toBeVisible({timeout:90000});
  const kinds=await panel.locator('.ocr-row select').evaluateAll(els=>els.map(e=>(e as HTMLSelectElement).value));
  expect(kinds).toEqual(['medication','allergy','vital']);
  const sign=panel.getByRole('button',{name:/Sign & commit 3 entries/});
  await expect(sign).toBeDisabled();
  await panel.getByLabel('I compared every included line with the handwritten original').check();
  await sign.click();
  await expect(panel.getByText('3 entries signed.')).toBeVisible();
  await expect(page.locator('.entry h3').filter({hasText:'Penicillin'}).last()).toBeVisible();
});

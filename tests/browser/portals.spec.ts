import { test,expect } from '@playwright/test';
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
  await expect(page.getByRole('button',{name:'Use camera'})).toBeDisabled();
  await page.getByLabel('Consent to session-only face candidate matching').check();
  await expect(page.getByRole('button',{name:'Use camera'})).toBeEnabled({timeout:30000});
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
  await page.getByRole('button',{name:'Register patient'}).click();
  const result=page.locator('.register-result');
  await expect(result.getByText(/^PR-\d{4}-\d{4}$/)).toBeVisible();
  const pid=await result.locator('.pass-id').innerText();
  await page.getByRole('button',{name:/Sign out/}).click();
  await page.goto('/patient');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('synthetic-pass-1');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Test Patient',{exact:true})).toBeVisible();
  await expect(page.getByText(pid,{exact:true})).toBeVisible();
});

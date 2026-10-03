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

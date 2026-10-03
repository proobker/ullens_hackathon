import { test,expect } from '@playwright/test';
test('patient portal, responsive source evidence and role isolation',async({page})=>{
  await page.goto('/patient');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Siddharth Raj Sharma',{exact:true})).toBeVisible();
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
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
  await expect(page.getByRole('alert')).toContainText('No prepared snapshot');
});

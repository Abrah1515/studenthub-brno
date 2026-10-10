import { expect,test } from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('studenthub-consent',JSON.stringify({analytics:false,marketing:false}));localStorage.setItem('studenthub-tutorial-state',JSON.stringify({tutorialVersion:3,introConfirmed:true,status:'completed',lastCompletedStep:null}));localStorage.setItem('studenthub-preference-v4',JSON.stringify({version:4,cityId:'brno',universityId:'vut',facultyId:'vut-fekt',completed:true}));});});
test('Odpočinek nezobrazuje skrytou hru a omalovánky zůstávají dostupné',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/brno/odpocinek');await expect(page.locator('.rest-activity')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Antistresové omalovánky'})).toBeVisible();
 await expect(page.locator('a[href*="spojovani-bodu"]')).toHaveCount(0);
 expect(requests.some(url=>url.includes('/api/rest-progress/dots'))).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await page.locator('.rest-activity').click();await expect(page.locator('.coloring-card')).toHaveCount(8);
});
test('přímé odkazy a API skryté hry jsou nedostupné, sitemap ji neobsahuje',async({request})=>{
 for(const city of ['brno','praha','olomouc','ostrava']){
  for(const suffix of ['', '/desk'])expect((await request.get(`/${city}/odpocinek/spojovani-bodu${suffix}`)).status()).toBe(404);
 }
 expect((await request.get('/api/rest-progress/dots')).status()).toBe(404);
 expect((await request.put('/api/rest-progress/dots/desk',{data:{}})).status()).toBe(404);
 const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);
 expect(await sitemap.text()).not.toContain('spojovani-bodu');expect(await sitemap.text()).toContain('/odpocinek/omalovanky');
});

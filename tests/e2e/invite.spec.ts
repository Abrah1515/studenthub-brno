import { expect,test } from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>{
 localStorage.setItem('studenthub-consent',JSON.stringify({analytics:false,marketing:false}));localStorage.setItem('studenthub-tutorial-state',JSON.stringify({tutorialVersion:3,introConfirmed:true,status:'completed',lastCompletedStep:null}));localStorage.setItem('studenthub-preference-v4',JSON.stringify({version:4,cityId:'brno',completed:true}));
 Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as unknown as {inviteCopied:string}).inviteCopied=value;}}});
});});
test('root: fallback, kopie, QR, focus, scroll lock a oba motivy',async({page},info)=>{
 const analytics:string[]=[];page.on('request',r=>{if(r.url().includes('/api/analytics/invite'))analytics.push(r.url());});
 await page.goto('/');const trigger=page.getByRole('button',{name:'Pozvat spolužáka',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'Pozvat spolužáka'});await expect(dialog).toBeVisible();
 await expect(page.locator('body')).toHaveCSS('position','fixed');await expect(dialog.getByRole('button',{name:'Zkopírovat odkaz'})).toBeFocused();
 await dialog.getByRole('button',{name:'Zkopírovat odkaz'}).click();await expect(dialog.getByRole('status')).toHaveText('Odkaz zkopírován');
 const copied=await page.evaluate(()=>(window as unknown as {inviteCopied:string}).inviteCopied);expect(new URL(copied).origin).toBe('https://studenthubapp.cz');expect(new URL(copied).pathname).toBe('/');
await dialog.getByRole('button',{name:'Zobrazit QR kód'}).click();const qr=dialog.getByAltText('QR kód veřejného odkazu na StudentHub');await expect(qr).toBeVisible();expect(await qr.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThanOrEqual(240);
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:`artifacts/invite/${info.project.name}-${theme}.png`});}
 await dialog.getByRole('button',{name:'Zavřít pozvánku'}).focus();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('textbox',{name:'Odkaz pro pozvání'})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await expect(page.locator('body')).not.toHaveCSS('position','fixed');expect(analytics).toEqual([]);
 await trigger.click();await page.locator('.invite-backdrop').click({position:{x:3,y:3}});await expect(dialog).not.toBeVisible();
});
test('menu ve všech aktivních městech zachová město, zavře se a nevytváří dva dialogy',async({page},info)=>{
 for(const city of ['brno','praha','ostrava','olomouc']){
  await page.goto(`/${city}/odpocinek`);
  if(info.project.name!=='desktop-1440')await page.getByRole('button',{name:'Otevřít nabídku'}).click();
  const menu=info.project.name==='desktop-1440'?page.locator('.desktop-sidebar'):page.getByRole('dialog',{name:'Mobilní nabídka'});
  await menu.getByRole('button',{name:'Pozvat spolužáka'}).click();const dialog=page.getByRole('dialog',{name:'Pozvat spolužáka'});await expect(dialog).toBeVisible();await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  expect(new URL(await dialog.getByRole('textbox',{name:'Odkaz pro pozvání'}).inputValue()).pathname).toBe(`/${city}`);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();if(info.project.name!=='desktop-1440')await expect(page.getByRole('button',{name:'Otevřít nabídku'})).toBeFocused();
 }
});
test('profil: chyba schránky nabízí ruční kopii, systémové sdílení v PWA a zrušení',async({page})=>{
 await page.goto('/brno/nastaveni');const trigger=page.locator('.settings-page .invite-button');await trigger.click();const dialog=page.getByRole('dialog',{name:'Pozvat spolužáka'});await expect(dialog).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));await dialog.getByRole('button',{name:'Zkopírovat odkaz'}).click();await expect(dialog.getByRole('status')).toContainText('Schránka není dostupná');await page.keyboard.press('Escape');
 await page.evaluate(()=>{Object.defineProperty(navigator,'standalone',{value:true,configurable:true});Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{(window as unknown as {inviteShared:ShareData}).inviteShared=data;}});});
 await trigger.click();await expect(dialog).not.toBeVisible();const data=await page.evaluate(()=>(window as unknown as {inviteShared:ShareData}).inviteShared);expect(data.title).toBe('StudentHub');expect(new URL(data.url!).pathname).toBe('/brno');expect(data).not.toHaveProperty('files');
 await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError');}}));await trigger.click();await expect(dialog).not.toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new Error('unavailable');}}));await trigger.click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('status')).toContainText('Systémové sdílení není dostupné');
});
test('přihlášený profil nesdílí identitu ani kontaktní údaje (izolovaná fixture)',async({page})=>{
 await page.route('**/api/profile',route=>route.fulfill({json:{profile:{email:'qa-private@example.test',username:'qa-private-name',displayName:'QA profil',accountStatus:'active',cityId:'brno',universityId:'vut',facultyId:'vut-fekt',studyYear:2,studyProgram:null,bio:null,interests:[],avatarUrl:null,profileVisibility:'private',showFaculty:false,showStudyProgram:false,showStudyYear:false,allowChatRequests:true,communityRulesAccepted:true,complete:true}}}));
 await page.goto('/brno/nastaveni');await expect(page.getByRole('textbox',{name:'Veřejná přezdívka *',exact:true})).toHaveValue('QA profil');await page.locator('.settings-page .invite-button').click();
 const url=await page.getByRole('textbox',{name:'Odkaz pro pozvání'}).inputValue();expect(new URL(url).pathname).toBe('/brno');for(const secret of ['qa-private','example.test','vut','fekt','profile'])expect(url).not.toContain(secret);
});

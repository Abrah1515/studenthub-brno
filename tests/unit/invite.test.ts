import { expect,it,vi } from 'vitest';
import { inviteUrl,inviteEventSchema,trackInvite } from '@/lib/invite';
const cities=['brno','praha','ostrava','olomouc'];
it('root a každé aktivní město používají pouze veřejný HTTPS vstup a pevné UTM',()=>{
 for(const path of ['/','/ucet/prihlaseni','/unknown/nastaveni',...cities.map(c=>`/${c}/nastaveni?email=private@example.test#profil`)]){
  const url=new URL(inviteUrl(path,cities,'clipboard'));
  expect(url.origin).toBe('https://studenthubapp.cz');expect(url.pathname).toBe(cities.some(c=>path.startsWith(`/${c}/`))?`/${path.split('/')[1]}`:'/');
  expect([...url.searchParams.keys()]).toEqual(['utm_source','utm_medium','utm_campaign']);expect(url.hash).toBe('');expect(url.href).not.toContain('private');
 }
 expect(new URL(inviteUrl('/praha/profil/adam',['brno'],'qr')).pathname).toBe('/');
 expect(new URL(inviteUrl('//evil.test/brno',cities,'native')).origin).toBe('https://studenthubapp.cz');
});
it('analytika přijímá jen pevné hodnoty, respektuje souhlas a nikdy neblokuje sdílení',()=>{
 const beacon=vi.fn();vi.stubGlobal('navigator',{sendBeacon:beacon});vi.stubGlobal('localStorage',{getItem:()=>'{"analytics":false}'});
 const event={action:'open',channel:'dialog',cityId:'brno'} as const;
 try{trackInvite(event);expect(beacon).not.toHaveBeenCalled();vi.stubGlobal('localStorage',{getItem:()=>'{"analytics":true}'});trackInvite(event);expect(beacon).toHaveBeenCalledOnce();expect(inviteEventSchema.safeParse({...event,email:'private@example.test'}).success).toBe(false);expect(inviteEventSchema.safeParse({...event,cityId:'https://evil.test'}).success).toBe(false);beacon.mockImplementation(()=>{throw Error('offline');});expect(()=>trackInvite(event)).not.toThrow();}finally{vi.unstubAllGlobals();}
});

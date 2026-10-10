import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
const limit=vi.hoisted(()=>vi.fn(async()=>true));vi.mock('@/lib/auth-rate-limit',()=>({allowAuthRequest:limit}));
import { POST } from '@/app/api/analytics/invite/route';
const event={action:'copy',channel:'clipboard',cityId:'brno'};
const send=(input:unknown,cookie='sh_analytics_consent=1',origin='https://studenthubapp.cz')=>POST(new Request('https://studenthubapp.cz/api/analytics/invite',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(input)}));
beforeEach(()=>vi.clearAllMocks());
it('bez souhlasu, cizí origin a osobní údaje nejsou zaznamenány',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{await send(event,'');await send(event,undefined,'https://evil.test');await send({...event,email:'private@example.test'});await send({payload:'x'.repeat(600)});expect(log).not.toHaveBeenCalled();expect(limit).not.toHaveBeenCalled();}finally{log.mockRestore();}
});
it('zaznamená jen anonymní enum událost a respektuje serverový rate limit',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{expect((await send(event)).status).toBe(204);expect(log).toHaveBeenCalledExactlyOnceWith('StudentHub invite event',event);limit.mockResolvedValueOnce(false);await send(event);expect(log).toHaveBeenCalledOnce();}finally{log.mockRestore();}
});

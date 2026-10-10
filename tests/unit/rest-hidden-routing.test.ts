import { expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only',()=>({}));
import { proxy } from '@/proxy';
it('blokuje hluboké odkazy před streamováním HTML a bez načtení session',async()=>{
 for(const path of ['/brno/odpocinek/spojovani-bodu','/praha/odpocinek/spojovani-bodu/desk','/olomouc/odpocinek/spojovani-bodu/desk','/ostrava/odpocinek/spojovani-bodu/desk']){
  const response=await proxy(new NextRequest(`https://studenthubapp.cz${path}`));
  expect(response.status).toBe(404);expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://studenthubapp.cz/_not-found');
 }
});

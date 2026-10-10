// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach,expect,it,vi } from 'vitest';
import { useColoringProgress } from '@/components/coloring-progress';
import { emptyDrawing } from '@/lib/coloring';
vi.mock('@/lib/coloring-local',()=>({readLocalDrawing:()=>null,writeLocalDrawing:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();});
it('nepotvrdí neúspěšný zápis a konflikt ponechá k rozhodnutí uživateli',async()=>{
 const owner='11111111-1111-4111-8111-111111111111';
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({userId:owner,items:[]})});vi.stubGlobal('fetch',fetcher);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 let progress:ReturnType<typeof useColoringProgress>;
 function Harness(){progress=useColoringProgress('desk',owner);return null;}
 const root=createRoot(document.createElement('div'));
 try{
  await act(async()=>root.render(createElement(Harness)));expect(progress!.ready).toBe(true);expect(progress!.status).toBe('Připraveno k vybarvování');
  await act(async()=>{progress!.change({...emptyDrawing(),colors:{1:'#abcdef'}});});
  fetcher.mockRejectedValueOnce(new Error('connection lost'));
  await act(async()=>progress!.retry());expect(progress!.status).toContain('nezdařilo');expect(progress!.value.dirty).toBe(true);
  const request=fetcher.mock.calls.at(-1)![1];expect(request.signal).toBeInstanceOf(AbortSignal);
  fetcher.mockResolvedValueOnce({status:409,ok:false,json:async()=>({current:{drawing:emptyDrawing(),revision:2,updated_at:'2026-10-10T10:00:00Z'}})});
  await act(async()=>progress!.retry());expect(progress!.conflict?.revision).toBe(2);expect(progress!.value.drawing.colors[1]).toBe('#abcdef');
  await act(async()=>progress!.resolve(true));expect(progress!.value.revision).toBe(2);expect(progress!.value.dirty).toBe(false);
 }finally{await act(async()=>root.unmount());}
});

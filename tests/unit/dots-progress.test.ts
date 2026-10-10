// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { useDotsProgress } from '@/components/dots-progress';
import { readLocalDots,writeLocalDots } from '@/lib/dots-local';
import { emptyDots } from '@/lib/connect-dots';
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});});
afterEach(()=>{vi.unstubAllGlobals();});
it('lokální import, offline, reconnect, revize a izolace účtů',async()=>{
 const owner='11111111-1111-4111-8111-111111111111';writeLocalDots('guest','desk',{drawing:{...emptyDots(),cursor:2},revision:0,dirty:true,updatedAt:new Date().toISOString()});
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({userId:owner,items:[]})});vi.stubGlobal('fetch',fetcher);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 let progress:ReturnType<typeof useDotsProgress>;function Harness(){progress=useDotsProgress('desk',owner);return null;}const root=createRoot(document.createElement('div'));const online=vi.spyOn(navigator,'onLine','get');
 try{await act(async()=>root.render(createElement(Harness)));expect(progress!.guest?.drawing.cursor).toBe(2);await act(async()=>progress!.importGuest());expect(progress!.value.drawing.cursor).toBe(2);expect(readLocalDots(owner,'desk')?.drawing.cursor).toBe(2);expect(readLocalDots('other','desk')).toBeNull();
 online.mockReturnValue(false);await act(async()=>progress!.retry());expect(progress!.status).toContain('Offline');expect(fetcher).toHaveBeenCalledTimes(1);
 online.mockReturnValue(true);fetcher.mockResolvedValueOnce({ok:true,json:async()=>({item:{progress:{...emptyDots(),cursor:2},revision:1,updated_at:new Date().toISOString()}})});await act(async()=>{window.dispatchEvent(new Event('online'));});expect(progress!.value.revision).toBe(1);expect(progress!.value.dirty).toBe(false);
 await act(async()=>progress!.change({...emptyDots(),cursor:3}));fetcher.mockResolvedValueOnce({status:409,ok:false,json:async()=>({current:{progress:{...emptyDots(),cursor:4},revision:2,updated_at:new Date().toISOString()}})});await act(async()=>progress!.retry());expect(progress!.conflict?.drawing.cursor).toBe(4);const calls=fetcher.mock.calls.length;await act(async()=>progress!.retry());expect(fetcher.mock.calls.length).toBe(calls);await act(async()=>progress!.resolve(false));expect(progress!.value.drawing.cursor).toBe(3);expect(progress!.value.revision).toBe(2);
 }finally{await act(async()=>root.unmount());online.mockRestore();}
});

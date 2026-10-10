// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
vi.mock('@/components/city-context',()=>({useCurrentCity:()=>({slug:'brno'})}));
vi.mock('@/components/coloring-gallery',()=>({ColoringGallery:()=>createElement('div',{'data-testid':'coloring'},'Moje omalovánky')}));
vi.mock('@/components/dots-gallery',()=>({DotsGallery:()=>createElement('div',{'data-testid':'dots'},'Moje spojování bodů')}));
import { MyColorings } from '@/components/my-colorings';
it('přihlášený profil nezobrazuje skrytou hru, omalovánky zůstávají',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({userId:'confirmed-user'})}));
 const container=document.createElement('div'),root=createRoot(container);
 try{await act(async()=>root.render(createElement(MyColorings)));expect(container.textContent).toBe('Moje omalovánky');expect(container.querySelector('[data-testid="dots"]')).toBeNull();}
 finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});

"use client";
import { createContext,useContext,useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Copy,Mail,MessageCircle,QrCode,Share2,X } from 'lucide-react';
import { inviteCity,inviteText,inviteUrl,trackInvite } from '@/lib/invite';
import { useModalDialog } from '@/lib/use-modal-dialog';
import { useFilterScrollLock } from '@/components/mobile-filter-toolbar';

type RequestShare={before?:()=>void;focus:()=>HTMLElement|null};
type ShareData={path:string;slugs:readonly string[];focus:()=>HTMLElement|null;error?:string};
const InviteContext=createContext<((request:RequestShare)=>void)|null>(null);
function InviteDialog({data,close}:{data:ShareData;close:()=>void}){
 const [message,setMessage]=useState(data.error||''),[qr,setQr]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const ref=useModalDialog<HTMLDivElement>(true,close);
 useFilterScrollLock(true);
 const url=(channel:Parameters<typeof inviteUrl>[2])=>inviteUrl(data.path,data.slugs,channel);
 async function copy(){
  setBusy(true);try{await navigator.clipboard.writeText(url('clipboard'));setMessage('Odkaz zkopírován');trackInvite({action:'copy',channel:'clipboard',cityId:inviteCity(data.path,data.slugs)});}
  catch{setMessage('Schránka není dostupná. Označte odkaz níže a zkopírujte jej ručně.');}finally{setBusy(false);}
 }
 async function showQr(){setBusy(true);try{const QR=await import('qrcode');setQr(await QR.toDataURL(url('qr'),{width:256,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}));}
 catch{setMessage('QR kód se nepodařilo vytvořit. Použijte kopírování odkazu.');}finally{setBusy(false);}}
 return createPortal(<div className="modal-backdrop invite-backdrop" data-modal-layer onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <div ref={ref} className="modal-card invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" aria-describedby="invite-description" tabIndex={-1} data-modal-layer>
   <div className="modal-head"><h2 id="invite-title">Pozvat spolužáka</h2><button className="icon-button" aria-label="Zavřít pozvánku" onClick={close}><X size={20}/></button></div>
   <p id="invite-description">Pošlete odkaz někomu, komu se může hodit. Komu jej pošlete, vybíráte jen vy.</p>
   <div className="invite-actions">
    <button className="button button-primary" data-autofocus disabled={busy} onClick={()=>void copy()}><Copy size={18}/>Zkopírovat odkaz</button>
    <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${inviteText}\n${url('whatsapp')}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>WhatsApp</a>
    <a className="button button-secondary" href={`mailto:?subject=${encodeURIComponent('StudentHub')}&body=${encodeURIComponent(`${inviteText}\n${url('email')}`)}`}><Mail size={18}/>Vlastním e-mailem</a>
    <button className="button button-secondary" disabled={busy} onClick={()=>void showQr()}><QrCode size={18}/>Zobrazit QR kód</button>
   </div>
   <label className="invite-link-label">Veřejný odkaz<input aria-label="Odkaz pro pozvání" readOnly value={url('clipboard')} onFocus={e=>e.currentTarget.select()}/></label>
   <p className="muted">Pro Messenger zkopírujte odkaz do vlastní zprávy. StudentHub nečte kontakty ani zprávy neodesílá.</p>
   <p role="status" aria-live="polite">{message}</p>
   {qr&&<div className="invite-qr">{/* Local generated QR; intentionally not optimized through an external image loader. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={qr} width={256} height={256} alt="QR kód veřejného odkazu na StudentHub"/>
   </div>}
  </div>
 </div>,document.body);
}
export function InviteProvider({children,publishedSlugs}:{children:React.ReactNode;publishedSlugs:readonly string[]}){
 const pathname=usePathname(),[data,setData]=useState<ShareData|null>(null),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const path=useRef(pathname);
 useEffect(()=>{path.current=pathname;},[pathname]);
 function close(){const focus=data?.focus;setData(null);window.setTimeout(()=>focus?.()?.focus(),0);}
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 useEffect(()=>{if(data&&data.path!==pathname){const id=setTimeout(()=>setData(null),0);return()=>clearTimeout(id);}},[data,pathname]);
 async function share(request:RequestShare){
  if(busy.current)return;busy.current=true;
  const currentPath=pathname,cityId=inviteCity(pathname,publishedSlugs),native=typeof navigator.share==='function';
  request.before?.();trackInvite({action:'open',channel:native?'native':'dialog',cityId});
  let error:string|undefined;
  if(native)try{await navigator.share({title:'StudentHub',text:inviteText,url:inviteUrl(currentPath,publishedSlugs,'native')});trackInvite({action:'native_complete',channel:'native',cityId});busy.current=false;window.setTimeout(()=>request.focus()?.focus(),0);return;}
  catch(cause){if(typeof cause==='object'&&cause!==null&&'name' in cause&&cause.name==='AbortError'){busy.current=false;window.setTimeout(()=>request.focus()?.focus(),0);return;}error='Systémové sdílení není dostupné. Vyberte jiný způsob.';}
  timer.current=setTimeout(()=>{if(path.current===currentPath)setData({path:currentPath,slugs:publishedSlugs,focus:request.focus,error});busy.current=false;},0);
 }
 return <InviteContext.Provider value={request=>void share(request)}>{children}{data&&<InviteDialog data={data} close={close}/>}</InviteContext.Provider>;
}
export function InviteButton({menu=false,primary=false,onBeforeOpen,returnFocus}:{menu?:boolean;primary?:boolean;onBeforeOpen?:()=>void;returnFocus?:()=>HTMLElement|null}){
 const share=useContext(InviteContext),ref=useRef<HTMLButtonElement>(null);
 if(!share)return null;
 return <button ref={ref} type="button" className={menu?'invite-menu-link':`button ${primary?'button-primary':'button-secondary'} invite-button`} aria-haspopup="dialog" onClick={()=>share({before:onBeforeOpen,focus:returnFocus||(()=>ref.current)})}><Share2 size={menu?15:18} aria-hidden="true"/><span>Pozvat spolužáka</span></button>;
}

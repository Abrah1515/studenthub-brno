"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawingSchema, emptyDrawing, reconcileDrawing, type Drawing, type SavedDrawing } from "@/lib/coloring";
import { readLocalDrawing, writeLocalDrawing } from "@/lib/coloring-local";
export function cloudDrawing(row: {drawing:Drawing;revision:number;updated_at:string}): SavedDrawing { return {drawing:row.drawing,revision:Number(row.revision),updatedAt:row.updated_at,dirty:false}; }
export function useColoringProgress(id:string,owner:string){
 const [value,setValue]=useState<SavedDrawing>({drawing:emptyDrawing(),revision:0,updatedAt:"",dirty:false});
 const [ready,setReady]=useState(false),[status,setStatus]=useState("Načítám postup…"),[conflict,setConflict]=useState<SavedDrawing|null>(null),[guest,setGuest]=useState<SavedDrawing|null>(null);
 const current=useRef(value),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 const apply=useCallback((v:SavedDrawing)=>{current.current=v;setValue(v);try{writeLocalDrawing(owner,id,v);return true;}catch{setStatus("Místní uložení se nezdařilo. Exportujte kresbu do PNG.");return false;}},[owner,id]);
 const save=useCallback(async()=>{
  if(busy.current||!current.current.dirty||owner==="guest")return;
  if(!navigator.onLine){setStatus("Offline – uložíme po připojení");return;}
  busy.current=true;const snapshot=current.current;setStatus("Ukládám…");
  try{const res=await fetch(`/api/coloring/${id}`,{method:"PUT",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:snapshot.revision,drawing:snapshot.drawing})});const data=await res.json();
   if(res.status===409){setConflict(data.current?cloudDrawing(data.current):{drawing:emptyDrawing(),revision:0,updatedAt:"",dirty:false});setStatus("Konflikt zařízení – vyberte, kterou kresbu zachovat.");}
   else if(!res.ok)throw Error(data.message);
   else{const saved=cloudDrawing(data.item);const newer=current.current.drawing!==snapshot.drawing;apply(newer?{...current.current,revision:saved.revision}:saved);setStatus(newer?"Ukládám…":"Uloženo v profilu");}
  }catch{if(mounted.current)setStatus(navigator.onLine?"Uložení se nezdařilo – zkusit znovu":"Offline – uložíme po připojení");}finally{busy.current=false;}
 },[id,owner,apply]);
 useEffect(()=>{mounted.current=true;let cancelled=false;
  const local=readLocalDrawing(owner,id);if(local)apply(local);
  if(owner!=="guest")setGuest(readLocalDrawing("guest",id));
  async function load(){try{if(owner!=="guest"){const res=await fetch('/api/coloring',{cache:'no-store'});if(!res.ok)throw Error();const data=await res.json();if(data.userId!==owner)throw Error();const row=data.items.find((r:{coloring_id:string})=>r.coloring_id===id);const cloud=row?cloudDrawing(row):null;const result=reconcileDrawing(local,cloud);if(cancelled)return;if(result.value)apply(result.value);if(result.conflict)setConflict(cloud||{drawing:emptyDrawing(),revision:0,updatedAt:"",dirty:false});}
   if(!cancelled)setStatus(local?.dirty&&owner!=="guest"?"Čeká na synchronizaci":owner==="guest"?"Uloženo na tomto zařízení":"Uloženo v profilu");
  }catch{if(!cancelled)setStatus("Cloud není dostupný – místní kresba zůstává zachovaná.");}finally{if(!cancelled)setReady(true);}}
  void load();const online=()=>{if(current.current.dirty){void save();return;}if(owner!=="guest")void fetch('/api/coloring',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(cancelled||current.current.dirty||data.userId!==owner)return;const row=data.items.find((r:{coloring_id:string})=>r.coloring_id===id);if(row)apply(cloudDrawing(row));}).catch(()=>undefined);};window.addEventListener('online',online);window.addEventListener('focus',online);
  return()=>{cancelled=true;mounted.current=false;window.removeEventListener('online',online);window.removeEventListener('focus',online);if(timer.current)clearTimeout(timer.current);void save();};
 },[id,owner,apply,save]);
 useEffect(()=>{if(!ready||!value.dirty||conflict)return;timer.current=setTimeout(()=>void save(),1200);return()=>{if(timer.current)clearTimeout(timer.current);};},[ready,value,conflict,save]);
 const change=(drawing:Drawing)=>{const valid=drawingSchema.safeParse(drawing);if(!valid.success){setStatus("Limit kresby byl dosažen. Exportujte PNG nebo vraťte poslední tah.");return false;}const stored=apply({...current.current,drawing,dirty:true,updatedAt:new Date().toISOString()});if(owner==="guest"&&stored)setStatus("Uloženo na tomto zařízení");return true;};
 return{value,ready,status,change,retry:save,conflict,resolve:(useCloud:boolean)=>{if(!conflict)return;apply(useCloud?conflict:{...current.current,revision:conflict.revision,dirty:true});setConflict(null);},guest,importGuest:()=>{if(!guest)return;change(guest.drawing);setGuest(null);},dismissGuest:()=>setGuest(null)};
}

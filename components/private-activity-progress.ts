"use client";
import { useCallback,useEffect,useRef,useState } from "react";
export type ActivitySave<T>={drawing:T;revision:number;updatedAt:string;dirty:boolean};
export type ActivityStorage<T>={empty:()=>T;valid:(id:string,input:unknown)=>T|null;read:(owner:string,id:string)=>ActivitySave<T>|null;write:(owner:string,id:string,value:ActivitySave<T>)=>void;api:string;row:(row:Record<string,unknown>)=>ActivitySave<T>;rowId:string;body:(value:ActivitySave<T>)=>unknown;prepared:string;localFailure:string};
// A single private, revision-aware synchronisation loop shared by both activities.
export function usePrivateActivityProgress<T>(id:string,owner:string,storage:ActivityStorage<T>){
 const blank=useCallback(():ActivitySave<T>=>({drawing:storage.empty(),revision:0,updatedAt:"",dirty:false}),[storage]);
 const [value,setValue]=useState(blank),[ready,setReady]=useState(false),[status,setStatus]=useState("Načítám postup…"),[conflict,setConflict]=useState<ActivitySave<T>|null>(null),[guest,setGuest]=useState<ActivitySave<T>|null>(null);
 const current=useRef(value),busy=useRef(false),mounted=useRef(true),conflictRef=useRef<ActivitySave<T>|null>(null);
 const apply=useCallback((v:ActivitySave<T>)=>{current.current=v;if(mounted.current)setValue(v);try{storage.write(owner,id,v);return true;}catch{if(mounted.current)setStatus(storage.localFailure);return false;}},[owner,id,storage]);
 const markConflict=useCallback((v:ActivitySave<T>)=>{conflictRef.current=v;if(mounted.current){setConflict(v);setStatus("Konflikt zařízení – vyberte, který postup zachovat.");}},[]);
 const save=useCallback(async()=>{
  if(busy.current||conflictRef.current||!current.current.dirty||owner==="guest")return;
  if(!navigator.onLine){if(mounted.current)setStatus("Offline – čeká na synchronizaci");return;}
  busy.current=true;const snapshot=current.current;if(mounted.current)setStatus("Ukládám…");
  try{const response=await fetch(`${storage.api}/${id}`,{method:"PUT",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json"},body:JSON.stringify(storage.body(snapshot))});const data=await response.json();
   if(response.status===409){markConflict(data.current?storage.row(data.current):blank());return;}
   if(!response.ok)throw Error();const saved=storage.row(data.item),newer=current.current.drawing!==snapshot.drawing;
   const stored=apply(newer?{...current.current,revision:saved.revision}:saved);if(mounted.current&&stored)setStatus(newer?"Ukládám…":"Uloženo v profilu");
  }catch{if(mounted.current)setStatus(navigator.onLine?"Uložení se nezdařilo – zkusit znovu":"Offline – čeká na synchronizaci");}finally{busy.current=false;}
 },[owner,id,storage,apply,blank,markConflict]);
 useEffect(()=>{mounted.current=true;let cancelled=false;const local=storage.read(owner,id);if(local)apply(local);if(owner!=="guest")setGuest(storage.read("guest",id));
  async function load(refresh=false){let stored=Boolean(local),hasConflict=false;try{
   if(owner!=="guest"){const response=await fetch(storage.api,{cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.userId!==owner)throw Error();const row=data.items.find((r:Record<string,unknown>)=>r[storage.rowId]===id),cloud=row?storage.row(row):null;if(cancelled)return;
    if(refresh){if(!current.current.dirty&&!conflictRef.current&&cloud)apply(cloud);return;}
    stored=stored||Boolean(cloud);if(local?.dirty&&(cloud?.revision??0)!==local.revision){hasConflict=true;markConflict(cloud??blank());}else if(local?.dirty)apply(local);else if(cloud)apply(cloud);else if(local&&local.revision>0){hasConflict=true;markConflict(blank());}
   }
   if(!cancelled&&!hasConflict)setStatus(local?.dirty&&owner!=="guest"?"Čeká na synchronizaci":!stored?storage.prepared:owner==="guest"?"Uloženo na tomto zařízení":"Uloženo v profilu");
  }catch{if(!cancelled)setStatus("Cloud není dostupný – místní postup zůstává zachovaný.");}finally{if(!cancelled)setReady(true);}}
  void load();const refresh=()=>{if(current.current.dirty){void save();return;}if(owner!=="guest")void load(true);};window.addEventListener("online",refresh);window.addEventListener("focus",refresh);
  return()=>{cancelled=true;mounted.current=false;window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);void save();};
 },[owner,id,storage,apply,blank,markConflict,save]);
 useEffect(()=>{if(!ready||!value.dirty||conflict)return;const timer=setTimeout(()=>void save(),1200);return()=>clearTimeout(timer);},[ready,value,conflict,save]);
 const change=(input:T)=>{const drawing=storage.valid(id,input);if(!drawing){setStatus("Neplatná nebo příliš velká data postupu.");return false;}const stored=apply({...current.current,drawing,dirty:true,updatedAt:new Date().toISOString()});if(stored)setStatus(owner==="guest"?"Uloženo na tomto zařízení":navigator.onLine?"Ukládám…":"Offline – čeká na synchronizaci");return true;};
 return{value,ready,status,change,retry:save,conflict,resolve:(useCloud:boolean)=>{const other=conflictRef.current;if(!other)return;apply(useCloud?other:{...current.current,revision:other.revision,dirty:true});conflictRef.current=null;setConflict(null);},guest,importGuest:()=>{if(guest){change(guest.drawing);setGuest(null);}},dismissGuest:()=>setGuest(null)};
}

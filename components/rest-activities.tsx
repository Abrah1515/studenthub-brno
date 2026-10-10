"use client";
import Image from "next/image";
import Link from "next/link";
import { Palette,Route,ArrowRight } from "lucide-react";
import { useEffect,useState } from "react";
import { activeRestActivities,isRestActivityEnabled } from "@/lib/rest-activities";
import { coloringAssets,type Drawing } from "@/lib/coloring";
import { readLocalDrawing } from "@/lib/coloring-local";
import { dotsGames } from "@/lib/connect-dots";
import { readLocalDots } from "@/lib/dots-local";
export function RestActivities({city,owner}:{city:string;owner:string}){
 const [started,setStarted]=useState<number|null>(null);
 const [dotsStarted,setDotsStarted]=useState<number|null>(null);
 useEffect(()=>{if(!isRestActivityEnabled('dots'))return;let active=true;async function load(){const cursors=new Map<string,number>();let available=true;
  if(owner!=="guest")try{const r=await fetch('/api/rest-progress/dots',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();if(data.userId!==owner)throw Error();for(const row of data.items)cursors.set(row.game_id,row.progress.cursor);}catch{available=false;}
  for(const game of dotsGames){const local=readLocalDots(owner,game.id);if(local&&(local.dirty||!cursors.has(game.id)))cursors.set(game.id,local.drawing.cursor);}
  if(active)setDotsStarted(available?dotsGames.filter(game=>{const cursor=cursors.get(game.id)??0;return cursor>0&&cursor<game.points.length;}).length:null);
 }void load();return()=>{active=false;};},[owner]);
 useEffect(()=>{let active=true;async function load(){const progress=new Map<string,{drawing:Drawing;completed:boolean}>();
  if(owner!=="guest")try{const response=await fetch('/api/coloring',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.userId!==owner)throw Error();for(const row of data.items)progress.set(row.coloring_id,{drawing:row.drawing,completed:row.completed});}catch{if(active)setStarted(null);return;}
  for(const asset of coloringAssets){const local=readLocalDrawing(owner,asset.id);if(local&&(local.dirty||!progress.has(asset.id)))progress.set(asset.id,{drawing:local.drawing,completed:local.drawing.completed});}
  if(active)setStarted([...progress.values()].filter(p=>!p.completed&&(Object.keys(p.drawing.colors).length||p.drawing.strokes.length)).length);
 }void load();return()=>{active=false;};},[owner]);
 return <section className="coloring-section"><h1>Odpočinek</h1><p className="muted">Krátká pauza, po vašem.</p><div className="rest-activities">{activeRestActivities().map(activity=>{const dots=activity.id==='dots',count=dots?dotsStarted:started,Icon=activity.icon==='route'?Route:Palette;return <Link className="rest-activity" key={activity.id} href={`/${city}${activity.href}`}><Image src={activity.previewAsset} alt={activity.title} width={256} height={341} unoptimized/><div><Icon size={24} aria-hidden="true"/><h2>{activity.title}</h2><p>{activity.description}</p><p className="muted">{dots?`${dotsGames.length} obrázků`:`${coloringAssets.length} omalovánek`}{count!==null&&` · ${count} ${dots?'rozpracovaných':count===1?'rozpracovaná':count>1&&count<5?'rozpracované':'rozpracovaných'} ${owner==="guest"?"na zařízení":"v profilu"}`}</p><span className="rest-activity-action">{count?"Pokračovat":dots?"Vybrat obrázek":"Vybrat omalovánku"}<ArrowRight size={17} aria-hidden="true"/></span></div></Link>})}</div></section>;
}

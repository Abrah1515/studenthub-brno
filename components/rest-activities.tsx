"use client";
import Image from "next/image";
import Link from "next/link";
import { Palette,ArrowRight } from "lucide-react";
import { useEffect,useState } from "react";
import { activeRestActivities } from "@/lib/rest-activities";
import { coloringAssets,type Drawing } from "@/lib/coloring";
import { readLocalDrawing } from "@/lib/coloring-local";
export function RestActivities({city,owner}:{city:string;owner:string}){
 const [started,setStarted]=useState<number|null>(null);
 useEffect(()=>{let active=true;async function load(){const progress=new Map<string,{drawing:Drawing;completed:boolean}>();
  if(owner!=="guest")try{const response=await fetch('/api/coloring',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.userId!==owner)throw Error();for(const row of data.items)progress.set(row.coloring_id,{drawing:row.drawing,completed:row.completed});}catch{if(active)setStarted(null);return;}
  for(const asset of coloringAssets){const local=readLocalDrawing(owner,asset.id);if(local&&(local.dirty||!progress.has(asset.id)))progress.set(asset.id,{drawing:local.drawing,completed:local.drawing.completed});}
  if(active)setStarted([...progress.values()].filter(p=>!p.completed&&(Object.keys(p.drawing.colors).length||p.drawing.strokes.length)).length);
 }void load();return()=>{active=false;};},[owner]);
 return <section className="coloring-section"><h1>Odpočinek</h1><p className="muted">Krátká pauza, po vašem.</p><div className="rest-activities">{activeRestActivities().map(activity=><Link className="rest-activity" key={activity.id} href={`/${city}${activity.href}`}><Image src={activity.previewAsset} alt="Útulný studentský pracovní kout k vybarvení" width={256} height={341} unoptimized/><div><Palette size={24} aria-hidden="true"/><h2>{activity.title}</h2><p>{activity.description}</p><p className="muted">{coloringAssets.length} omalovánek{started!==null&&` · ${started} ${started===1?'rozpracovaná':started>1&&started<5?'rozpracované':'rozpracovaných'} ${owner==="guest"?"na zařízení":"v profilu"}`}</p><span className="rest-activity-action">{started?"Pokračovat":"Vybrat omalovánku"}<ArrowRight size={17} aria-hidden="true"/></span></div></Link>)}</div></section>;
}

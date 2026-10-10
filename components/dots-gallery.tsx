"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect,useState } from "react";
import { dotsGames,dotsPercentage } from "@/lib/connect-dots";
import { readLocalDots } from "@/lib/dots-local";
import { cloudDots } from "@/components/dots-progress";
type Row={cursor:number;percentage:number;updatedAt:string};
export function DotsGallery({city,owner,compact=false}:{city:string;owner:string;compact?:boolean}){
 const [rows,setRows]=useState<Record<string,Row>>({}),[filter,setFilter]=useState("all"),[error,setError]=useState("");
 useEffect(()=>{let active=true;async function load(){const next:Record<string,Row>={};if(owner!=="guest")try{const response=await fetch('/api/rest-progress/dots',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.userId!==owner)throw Error();for(const row of data.items){const value=cloudDots(row);next[row.game_id]={cursor:value.drawing.cursor,percentage:row.percentage,updatedAt:value.updatedAt};}}catch{if(active)setError("Cloudový postup není dostupný. Zobrazený místní postup zůstává zachovaný.");}
  for(const game of dotsGames){const local=readLocalDots(owner,game.id);if(local&&(local.dirty||!next[game.id]))next[game.id]={cursor:local.drawing.cursor,percentage:dotsPercentage(game,local.drawing),updatedAt:local.updatedAt};}if(active)setRows(next);
 }void load();return()=>{active=false;};},[owner]);
 const visible=dotsGames.filter(g=>{const cursor=rows[g.id]?.cursor??0;return compact||filter==='started'?cursor>0&&cursor<g.points.length:filter==='done'?cursor===g.points.length:true;}).toSorted((a,b)=>compact?(rows[b.id]?.updatedAt??"").localeCompare(rows[a.id]?.updatedAt??""):0).slice(0,compact?3:dotsGames.length);
 return <section className="coloring-section dots-gallery">{!compact&&<Link href={`/${city}/odpocinek`}>← Odpočinek</Link>}{compact?<h2><Link href={`/${city}/odpocinek/spojovani-bodu`}>Moje spojování bodů</Link></h2>:<><h1>Spojování bodů</h1><p className="muted">Postupně odhalte obrys. Bez spěchu, prstem, perem nebo myší.</p><div className="dots-filters" aria-label="Filtrovat obrázky">{[['all','Všechny'],['started','Rozpracované'],['done','Dokončené']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></>}{error&&<p role="status">{error}</p>}
 <div className="coloring-grid">{visible.map(game=>{const row=rows[game.id],cursor=row?.cursor??0;return <article className="coloring-card dots-card" key={game.id}><Image src={game.previewAsset} alt={game.title} width={256} height={341} unoptimized loading="lazy"/><div><h3>{game.title}</h3><p>{game.difficulty} · {game.points.length} bodů</p><p>{cursor===game.points.length?'Dokončená':cursor>0?'Rozpracovaná':'Nová'} · {row?.percentage??0} %</p>{compact&&row?.updatedAt&&<p className="muted">Změněno {new Date(row.updatedAt).toLocaleString('cs-CZ')}</p>}<Link href={`/${city}/odpocinek/spojovani-bodu/${game.slug}`}>{cursor>0?'Pokračovat':'Začít'}</Link></div></article>})}</div>{!visible.length&&<p className="muted">{compact?"Zatím nemáte rozehraný obrázek.":"V tomto výběru zatím nejsou žádné obrázky."}</p>}</section>;
}

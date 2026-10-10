"use client";
import Link from "next/link";
import { ArrowLeft,Undo2,Redo2,RotateCcw,ZoomIn,ZoomOut,Maximize,Minimize,Hash,Hand,MousePointer2 } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { connectDot,undoDot,redoDot,emptyDots,dotsPercentage,type DotsManifest } from "@/lib/connect-dots";
import { useDotsProgress } from "@/components/dots-progress";
import { cachedAsset } from "@/lib/coloring-local";
import { useModalDialog } from "@/lib/use-modal-dialog";
type View={zoom:number;x:number;y:number};
export function DotsGame({game,city,owner}:{game:DotsManifest;city:string;owner:string}){
 const progress=useDotsProgress(game.id,owner),state=progress.value.drawing,completed=state.cursor===game.points.length;
 const [numbers,setNumbers]=useState(true),[pan,setPan]=useState(false),[full,setFull]=useState(false),[reset,setReset]=useState(false),[hint,setHint]=useState(""),[asset,setAsset]=useState<string|null>(null),[assetError,setAssetError]=useState(false),[scale,setScale]=useState(1);
 const svg=useRef<SVGSVGElement>(null),stage=useRef<HTMLDivElement>(null),view=useRef<View>({zoom:1,x:0,y:0}),frame=useRef(0),penUntil=useRef(0),pointers=useRef(new Map<number,{x:number;y:number}>()),gesture=useRef<{view:View;distance:number;center:{x:number;y:number}}|null>(null),drag=useRef<{x:number;y:number;point:number|null;view:View}|null>(null);
 const fullRef=useModalDialog<HTMLDivElement>(full&&!reset,()=>setFull(false)),resetRef=useModalDialog<HTMLDivElement>(reset,()=>setReset(false));
 const xs=game.points.map(p=>p.x*768),ys=game.points.map(p=>p.y*1024),box={x:Math.min(...xs)-55,y:Math.min(...ys)-55,w:Math.max(...xs)-Math.min(...xs)+110,h:Math.max(...ys)-Math.min(...ys)+110};
 const paint=()=>{cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{if(svg.current)svg.current.style.transform=`translate(${view.current.x}px,${view.current.y}px) scale(${view.current.zoom})`;});};
 useEffect(()=>{let active=true,url:string|undefined;void cachedAsset(game.completedAsset).then(blob=>{url=URL.createObjectURL(blob);if(active)setAsset(url);else URL.revokeObjectURL(url);}).catch(()=>{if(active)setAssetError(true);});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[game.completedAsset]);
 useEffect(()=>{const element=stage.current;if(!element)return;const measure=()=>setScale(Math.min(element.clientWidth/box.w,element.clientHeight/box.h));const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[box.w,box.h,full]);
 useEffect(()=>{const element=stage.current;if(!element)return;const wheel=(e:WheelEvent)=>{e.preventDefault();if(e.ctrlKey){view.current.zoom=Math.max(1,Math.min(4,view.current.zoom*Math.exp(-e.deltaY*.005)));}else{view.current.x-=e.deltaX;view.current.y-=e.deltaY;}cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{if(svg.current)svg.current.style.transform=`translate(${view.current.x}px,${view.current.y}px) scale(${view.current.zoom})`;});};element.addEventListener("wheel",wheel,{passive:false});return()=>{element.removeEventListener("wheel",wheel);cancelAnimationFrame(frame.current);};},[]);
 const choose=(index:number)=>{if(!progress.ready)return;const next=connectDot(game,state,index);if(next===state){setHint(completed?"Obrázek je hotový. Můžete ho otevřít jako omalovánku.":`Pokračujte bodem ${state.cursor+1}. Váš postup zůstává beze změny.`);return;}setHint("");progress.change(next);if(next.cursor===game.points.length)void progress.retry();};
 const nearest=(x:number,y:number)=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return null;let result:number|null=null,best=24;game.points.forEach((p,index)=>{const screen=new DOMPoint(p.x*768,p.y*1024).matrixTransform(matrix),distance=Math.hypot(screen.x-x,screen.y-y);if(distance<best){best=distance;result=index;}});return result;};
 const middle=()=>{const [a,b]=[...pointers.current.values()];return a&&b?{distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}:null;};
 const points=game.points.slice(0,state.cursor).map(p=>`${p.x*768},${p.y*1024}`);if(completed)points.push(points[0]);
 return <div ref={fullRef} className={`coloring-editor dots-game${full?" dots-fullscreen":""}`} role={full&&!reset?"dialog":undefined} aria-modal={full&&!reset||undefined} aria-label={full?game.title:undefined}>
  <Link href={`/${city}/odpocinek/spojovani-bodu`} onClick={()=>void progress.retry()}><ArrowLeft size={16}/> Všechny obrázky</Link>
  <h1>{game.title}</h1><p role="status" className="coloring-status">{progress.status} · {dotsPercentage(game,state)} %</p>
  {progress.status.includes("nezdařilo")&&<button onClick={()=>void progress.retry()}>Zkusit uložit znovu</button>}
  {progress.conflict&&<div role="alert"><p>Na jiném zařízení je jiný postup. Vyberte, který zachovat.</p><button onClick={()=>progress.resolve(true)}>Použít postup z profilu</button><button onClick={()=>progress.resolve(false)}>Zachovat místní postup</button></div>}
  {progress.guest&&progress.guest.drawing.cursor>0&&<div><p>Na tomto zařízení máte rozehraný obrázek bez přihlášení.</p><button onClick={progress.importGuest}>Převzít do profilu</button><button onClick={progress.dismissGuest}>Ponechat odděleně</button></div>}
  <div className="dots-tools" aria-label="Nástroje spojování bodů">
   <button title="Spojovat body" aria-label="Spojovat body" aria-pressed={!pan} onClick={()=>setPan(false)}><MousePointer2 size={20}/></button><button title="Posouvat plátno" aria-label="Posouvat plátno" aria-pressed={pan} onClick={()=>setPan(true)}><Hand size={20}/></button>
   <button title="Krok zpět" aria-label="Krok zpět" disabled={!state.undo.length} onClick={()=>progress.change(undoDot(state))}><Undo2 size={20}/></button><button title="Krok vpřed" aria-label="Krok vpřed" disabled={!state.redo.length} onClick={()=>progress.change(redoDot(state))}><Redo2 size={20}/></button>
   <button title="Zobrazit čísla" aria-label="Zobrazit čísla" aria-pressed={numbers} onClick={()=>setNumbers(!numbers)}><Hash size={20}/></button>
   <button title="Přiblížit" aria-label="Přiblížit" onClick={()=>{view.current.zoom=Math.min(4,view.current.zoom*1.25);paint();}}><ZoomIn size={20}/></button><button title="Oddálit" aria-label="Oddálit" onClick={()=>{view.current.zoom=Math.max(1,view.current.zoom/1.25);paint();}}><ZoomOut size={20}/></button>
   <button title={full?"Ukončit celou obrazovku":"Celá obrazovka"} aria-label={full?"Ukončit celou obrazovku":"Celá obrazovka"} onClick={()=>setFull(!full)}>{full?<Minimize size={20}/>:<Maximize size={20}/>}</button><button title="Začít znovu" aria-label="Začít znovu" onClick={()=>setReset(true)}><RotateCcw size={20}/></button>
  </div>
  <div ref={stage} className="dots-stage" data-testid="dots-stage">
   <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-label={`Spojování bodů: ${game.title}`} tabIndex={0}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(state.cursor);}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();view.current.x+=e.key==="ArrowRight"?20:e.key==="ArrowLeft"?-20:0;view.current.y+=e.key==="ArrowDown"?20:e.key==="ArrowUp"?-20:0;paint();}}}
    onPointerDown={e=>{if(e.pointerType==="pen")penUntil.current=Date.now()+800;if(e.pointerType==="touch"&&Date.now()<penUntil.current)return;e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pair=middle();if(pair){gesture.current={...pair,view:{...view.current}};drag.current=null;}else drag.current={x:e.clientX,y:e.clientY,point:nearest(e.clientX,e.clientY),view:{...view.current}};}}
    onPointerMove={e=>{if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pair=middle();if(pair&&gesture.current){const g=gesture.current;view.current={zoom:Math.max(1,Math.min(4,g.view.zoom*pair.distance/Math.max(1,g.distance))),x:g.view.x+pair.center.x-g.center.x,y:g.view.y+pair.center.y-g.center.y};paint();}else if(pan&&drag.current){view.current={...drag.current.view,x:drag.current.view.x+e.clientX-drag.current.x,y:drag.current.view.y+e.clientY-drag.current.y};paint();}}}
    onPointerUp={e=>{const start=drag.current,wasGesture=Boolean(gesture.current);pointers.current.delete(e.pointerId);if(!pointers.current.size){gesture.current=null;drag.current=null;}if(!wasGesture&&!pan&&start){const end=nearest(e.clientX,e.clientY),distance=Math.hypot(start.x-e.clientX,start.y-e.clientY);if(end!==null&&(distance<12||start.point===state.cursor-1))choose(end);}}}
    onPointerCancel={e=>{pointers.current.delete(e.pointerId);drag.current=null;gesture.current=null;}}>
    {completed&&asset&&<image className="dots-reveal" href={asset} x="0" y="0" width="768" height="1024"/>}
    <polyline data-testid="dots-line" points={points.join(" ")} fill="none" stroke="var(--primary,#6366f1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
    {!completed&&game.points.map((p,index)=><g key={index} role="button" aria-label={`Bod ${index+1}`} aria-disabled={!progress.ready} tabIndex={index===state.cursor?0:-1} className={`dots-point${index===state.cursor?" dots-next":""}${index<state.cursor?" dots-connected":""}`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();choose(index);}}} transform={`translate(${p.x*768},${p.y*1024})`}>
     <circle r={22/scale} fill="transparent"/><circle r={11/scale} className="dots-visible" strokeWidth={1.5/scale}/>{numbers&&<text fontSize={12/scale} textAnchor="middle" dominantBaseline="central">{index+1}</text>}
    </g>)}
   </svg>
   {!progress.ready&&<div className="dots-loading" role="status">Načítám postup…</div>}
  </div>
  <p className="dots-hint" role="status">{hint||(!completed?`Spojte bod ${state.cursor+1} z ${game.points.length}. Klikněte, táhněte nebo použijte Enter na plátně.`:"Dokončeno. Chvíle klidu, po vašem.")}</p>
  {completed&&<div className="dots-complete"><h2>Dokončeno</h2>{!asset&&<p role="status">{assetError?"Kresba není dostupná offline. Postup je zachován; obnovte stránku po připojení.":"Načítám hotovou kresbu…"}</p>}<Link href={`/${city}/odpocinek/omalovanky/${game.relatedColoringPageSlug}`} onClick={()=>void progress.retry()}>Vybarvit tento obrázek</Link><Link href={`/${city}/odpocinek/spojovani-bodu`}>Zpět do galerie</Link><button onClick={()=>setReset(true)}>Spojit znovu</button></div>}
  {reset&&<div className="dots-reset-backdrop"><div ref={resetRef} role="dialog" aria-modal="true" aria-labelledby="dots-reset-title" className="dots-reset"><h2 id="dots-reset-title">Začít tento obrázek znovu?</h2><p>Vymaže se pouze postup spojování tohoto obrázku.</p><button onClick={()=>setReset(false)}>Zrušit</button><button onClick={()=>{progress.change(emptyDots());setReset(false);}}>Začít znovu</button></div></div>}
 </div>;
}

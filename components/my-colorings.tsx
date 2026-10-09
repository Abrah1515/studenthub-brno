"use client";
import { useEffect,useState } from "react";
import { useCurrentCity } from "@/components/city-context";
import { ColoringGallery } from "@/components/coloring-gallery";
import "@/app/[city]/odpocinek/coloring.css";
export function MyColorings(){const city=useCurrentCity(),[owner,setOwner]=useState<string|null>(null);useEffect(()=>{let active=true;void fetch('/api/coloring',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(active&&data?.userId)setOwner(data.userId);}).catch(()=>undefined);return()=>{active=false;};},[]);return owner?<ColoringGallery city={city.slug} owner={owner} compact/>:null;}

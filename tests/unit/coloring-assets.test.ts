import { createCanvas,loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { coloringAssets,regionAt,type Region } from "@/lib/coloring";
it('všech osm masek má klikatelné regiony a neprázdné linky',{timeout:20000},async()=>{
 for(const asset of coloringAssets){const path=`public/coloring/v1/${asset.id}`,regions=JSON.parse(await readFile(`${path}/regions.json`,'utf8')) as Region[];const mask=await loadImage(`${path}/mask.png`),lines=await loadImage(`${path}/lines.png`),c=createCanvas(mask.width,mask.height),ctx=c.getContext('2d');expect(mask.width).toBe(768);expect(mask.height).toBe(1024);expect(regions.length).toBeGreaterThan(30);ctx.drawImage(mask,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;for(const r of regions){expect(regionAt(data,c.width,c.height,r.x,r.y)).toBe(r.id);expect(r.area).toBeGreaterThanOrEqual(180);}ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(lines,0,0);expect(ctx.getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>0).length).toBeGreaterThan(5000);}
});

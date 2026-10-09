// Offline preparation only. Source PNGs are generated once, not at runtime.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const [id, source] = process.argv.slice(2);
if (!/^(botanical|desk|library|cafe|brno|praha|olomouc|ostrava)$/.test(id || '') || !source) throw Error('Usage: node scripts/prepare-coloring-assets.mjs <id> <source.png>');
const image = await loadImage(source), w = 768, h = Math.round(w * image.height / image.width);
const canvas = createCanvas(w,h), ctx = canvas.getContext('2d'); ctx.drawImage(image,0,0,w,h);
const raw=ctx.getImageData(0,0,w,h), black=new Uint8Array(w*h);
for(let i=0;i<black.length;i++) black[i]=(raw.data[i*4]+raw.data[i*4+1]+raw.data[i*4+2])/3<170?1:0;
// Close single-pixel gaps without widening the final line art.
const dilated=new Uint8Array(black.length), closed=new Uint8Array(black.length);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;dilated[i]=black[i]||black[i-1]||black[i+1]||black[i-w]||black[i+w];}
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;closed[i]=black[i]||(dilated[i]&&dilated[i-1]&&dilated[i+1]&&dilated[i-w]&&dilated[i+w]);}
const labels=new Uint32Array(w*h), queue=new Uint32Array(w*h), regions=[];let next=1;
for(let start=0;start<labels.length;start++){
 if(closed[start]||labels[start])continue;
 let head=0,tail=1,border=false;queue[0]=start;labels[start]=0xffffffff;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(!x||!y||x===w-1||y===h-1)border=true;
 for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!closed[j]&&!labels[j]){labels[j]=0xffffffff;queue[tail++]=j;}}
 const keep=!border&&tail>=180;const regionId=keep?next++:0;
 for(let n=0;n<tail;n++)labels[queue[n]]=regionId||0xfffffffe;
 if(keep){const sample=queue[Math.floor(tail/2)];regions.push({id:regionId,area:tail,x:sample%w,y:Math.floor(sample/w)});}
}
const mask=ctx.createImageData(w,h),lines=ctx.createImageData(w,h);
for(let i=0;i<labels.length;i++){const v=labels[i]<0xfffffffe?labels[i]:0;mask.data.set([v&255,(v>>8)&255,(v>>16)&255,255],i*4);lines.data.set([0,0,0,closed[i]?255:0],i*4);}
const dir=join('public','coloring','v1',id);await mkdir(dir,{recursive:true});
ctx.putImageData(mask,0,0);await writeFile(join(dir,'mask.png'),canvas.toBuffer('image/png'));
ctx.putImageData(lines,0,0);await writeFile(join(dir,'lines.png'),canvas.toBuffer('image/png'));
ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
const thumb=createCanvas(256,Math.round(256*h/w));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
await writeFile(join(dir,'preview.webp'),thumb.toBuffer('image/webp',85));await writeFile(join(dir,'regions.json'),JSON.stringify(regions));
console.log(JSON.stringify({id,width:w,height:h,regions:regions.length}));

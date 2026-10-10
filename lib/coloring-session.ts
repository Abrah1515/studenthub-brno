import { z } from "zod";
import { colorSchema } from "@/lib/coloring";
const viewSchema=z.object({zoom:z.number().min(1).max(4),pan:z.object({x:z.number().finite(),y:z.number().finite()})});
export function readColoringView(owner:string,id:string){try{const v=viewSchema.safeParse(JSON.parse(sessionStorage.getItem(`coloring-view:${owner}:${id}`)||'null'));return v.success?v.data:{zoom:1,pan:{x:0,y:0}};}catch{return{zoom:1,pan:{x:0,y:0}};}}
export function saveColoringView(owner:string,id:string,view:z.infer<typeof viewSchema>){try{sessionStorage.setItem(`coloring-view:${owner}:${id}`,JSON.stringify(viewSchema.parse(view)));}catch{/* View state is optional; never interrupt drawing. */}}
export function recentColor(color:string,current:string[]){return [color,...current.filter(c=>c!==color)].filter(c=>colorSchema.safeParse(c).success).slice(0,6);}

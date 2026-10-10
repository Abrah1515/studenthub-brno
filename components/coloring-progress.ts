"use client";
import { drawingSchema,emptyDrawing,type Drawing,type SavedDrawing } from "@/lib/coloring";
import { readLocalDrawing,writeLocalDrawing } from "@/lib/coloring-local";
import { usePrivateActivityProgress,type ActivityStorage } from "@/components/private-activity-progress";
export function cloudDrawing(row:{drawing:Drawing;revision:number;updated_at:string}):SavedDrawing{return{drawing:row.drawing,revision:Number(row.revision),updatedAt:row.updated_at,dirty:false};}
const storage:ActivityStorage<Drawing>={empty:emptyDrawing,valid:(_id,input)=>{const parsed=drawingSchema.safeParse(input);return parsed.success?parsed.data:null;},read:readLocalDrawing,write:writeLocalDrawing,api:"/api/coloring",rowId:"coloring_id",row:row=>cloudDrawing(row as {drawing:Drawing;revision:number;updated_at:string}),body:value=>({revision:value.revision,drawing:value.drawing}),prepared:"Připraveno k vybarvování",localFailure:"Místní uložení se nezdařilo. Exportujte kresbu do PNG."};
export function useColoringProgress(id:string,owner:string){return usePrivateActivityProgress(id,owner,storage);}

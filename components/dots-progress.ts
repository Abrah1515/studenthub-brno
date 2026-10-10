"use client";
import { dotsGames,emptyDots,validDotsProgress,type DotsProgress } from "@/lib/connect-dots";
import { readLocalDots,writeLocalDots } from "@/lib/dots-local";
import { usePrivateActivityProgress,type ActivityStorage,type ActivitySave } from "@/components/private-activity-progress";
export function cloudDots(row:Record<string,unknown>):ActivitySave<DotsProgress>{return{drawing:row.progress as DotsProgress,revision:Number(row.revision),updatedAt:String(row.updated_at),dirty:false};}
const storage:ActivityStorage<DotsProgress>={empty:emptyDots,valid:(id,input)=>{const game=dotsGames.find(g=>g.id===id);return game?validDotsProgress(game,input):null;},read:readLocalDots,write:writeLocalDots,api:"/api/rest-progress/dots",rowId:"game_id",row:cloudDots,body:value=>({revision:value.revision,progress:value.drawing}),prepared:"Připraveno ke spojování",localFailure:"Místní uložení se nezdařilo. Nezavírejte hru a zkuste uložení znovu."};
export function useDotsProgress(id:string,owner:string){return usePrivateActivityProgress(id,owner,storage);}

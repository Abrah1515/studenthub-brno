"use client";
import { dotsGames,validDotsProgress,type DotsProgress } from "@/lib/connect-dots";
import type { ActivitySave } from "@/components/private-activity-progress";
export const dotsLocalKey=(owner:string,id:string)=>`studenthub-dots-v1:${owner}:${id}`;
export function readLocalDots(owner:string,id:string):ActivitySave<DotsProgress>|null{
 try{const row=JSON.parse(localStorage.getItem(dotsLocalKey(owner,id))||"null"),game=dotsGames.find(g=>g.id===id);if(!row||!game||!validDotsProgress(game,row.drawing)||!Number.isSafeInteger(row.revision)||row.revision<0||typeof row.dirty!=="boolean"||typeof row.updatedAt!=="string")return null;return row;}catch{return null;}
}
export function writeLocalDots(owner:string,id:string,value:ActivitySave<DotsProgress>){localStorage.setItem(dotsLocalKey(owner,id),JSON.stringify(value));}

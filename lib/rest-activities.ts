export type RestActivity = Readonly<{
  id:string;slug:string;title:string;description:string;icon:"palette";
  previewAsset:string;href:`/${string}`;enabled:boolean;order:number;
}>;
export const restActivities:readonly RestActivity[]=[{
  id:"coloring",slug:"omalovanky",title:"Antistresové omalovánky",
  description:"Vyberte si obrázek a na chvíli vypněte. Prstem, perem nebo myší.",
  icon:"palette",previewAsset:"/coloring/v1/desk/preview.webp",
  href:"/odpocinek/omalovanky",enabled:true,order:1,
}];
export function activeRestActivities(){return restActivities.filter(a=>a.enabled).toSorted((a,b)=>a.order-b.order);}

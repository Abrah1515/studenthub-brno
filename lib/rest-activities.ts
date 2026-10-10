export type RestActivity = Readonly<{
  id:string;slug:string;title:string;description:string;icon:"palette"|"route";
  previewAsset:string;href:`/${string}`;enabled:boolean;order:number;
}>;
export const restActivities:readonly RestActivity[]=[{
  id:"coloring",slug:"omalovanky",title:"Antistresové omalovánky",
  description:"Vyberte si obrázek a na chvíli vypněte. Prstem, perem nebo myší.",
  icon:"palette",previewAsset:"/coloring/v1/desk/preview.webp",
  href:"/odpocinek/omalovanky",enabled:true,order:1,
},{
  id:"dots",slug:"spojovani-bodu",title:"Spojování bodů",
  description:"Spojujte body a postupně odhalte kresbu. Bez spěchu a bez soutěžení.",
  icon:"route",previewAsset:"/coloring/v1/botanical/preview.webp",
  href:"/odpocinek/spojovani-bodu",enabled:true,order:2,
}];
export function activeRestActivities(){return restActivities.filter(a=>a.enabled).toSorted((a,b)=>a.order-b.order);}

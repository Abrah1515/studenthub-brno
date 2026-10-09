import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringClient,coloringRegions } from "@/lib/coloring-server";
import { MAX_PAYLOAD, coloringAssets, completion, saveDrawingSchema } from "@/lib/coloring";
import { allowAuthRequest } from "@/lib/auth-rate-limit";

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  const account=await getCurrentAccount();
  if(!account) return NextResponse.json({message:"Pro synchronizaci se přihlaste."},{status:401});
  if(account.accountStatus!=="active") return NextResponse.json({message:"Účet je pozastavený."},{status:403});
  const {id}=await params; if(!coloringAssets.some(a=>a.id===id)) return NextResponse.json({message:"Omalovánka neexistuje."},{status:404});
  if(new URL(request.url).origin!==request.headers.get("origin")) return NextResponse.json({message:"Nepovolený původ požadavku."},{status:403});
  if(!await allowAuthRequest(request,`clr-${account.id.replaceAll("-","").slice(0,24)}`,60,60)) return NextResponse.json({message:"Ukládání je příliš časté. Zkuste to za chvíli."},{status:429});
  if(Number(request.headers.get("content-length"))>MAX_PAYLOAD)return NextResponse.json({message:"Omalovánka je příliš velká."},{status:413});
  let text="";const reader=request.body?.getReader();if(reader){const decoder=new TextDecoder();let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PAYLOAD){await reader.cancel();return NextResponse.json({message:"Omalovánka je příliš velká."},{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  let value:unknown;try{value=JSON.parse(text)}catch{return NextResponse.json({message:"Neplatné údaje."},{status:422})}
  const parsed=saveDrawingSchema.safeParse(value); if(!parsed.success) return NextResponse.json({message:"Neplatné údaje omalovánky."},{status:422});
  const regions=await coloringRegions(id); const validIds=new Set(regions.map(r=>String(r.id)));
  if(Object.keys(parsed.data.drawing.colors).some(key=>!validIds.has(key)))return NextResponse.json({message:"Neplatná oblast omalovánky."},{status:422});
  const client=await coloringClient();
  const {data,error}=await client.rpc("save_coloring_progress",{p_coloring_id:id,p_revision:parsed.data.revision,p_drawing:parsed.data.drawing,p_percentage:completion(parsed.data.drawing,regions)});
  if(error?.code==="40001") {const current=await client.from("coloring_progress").select("drawing,revision,updated_at").eq("coloring_id",id).maybeSingle();return NextResponse.json({message:"Na jiném zařízení jsou novější změny. Vaše místní kresba zůstala zachovaná.",current:current.data},{status:409})}
  if(error?.code==="54000")return NextResponse.json({message:"Ukládání je příliš časté. Zkuste to za chvíli."},{status:429});
  if(error)return NextResponse.json({message:"Uložení se nezdařilo – zkusit znovu."},{status:503});
  return NextResponse.json({item:data},{headers:{"Cache-Control":"private, no-store"}});
}

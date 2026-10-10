import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringClient } from "@/lib/coloring-server";
import { allowAuthRequest } from "@/lib/auth-rate-limit";
import { dotsGames,dotsSaveSchema,validDotsProgress,DOTS_MAX_PAYLOAD } from "@/lib/connect-dots";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const account=await getCurrentAccount();if(!account)return NextResponse.json({message:"Pro synchronizaci se přihlaste."},{status:401});
 if(account.accountStatus!=="active")return NextResponse.json({message:"Účet je pozastavený."},{status:403});
 const {id}=await params,game=dotsGames.find(g=>g.id===id);if(!game)return NextResponse.json({message:"Obrázek neexistuje."},{status:404});
 if(new URL(request.url).origin!==request.headers.get("origin"))return NextResponse.json({message:"Nepovolený původ požadavku."},{status:403});
 if(!await allowAuthRequest(request,`dots-${account.id.replaceAll("-","").slice(0,24)}`,60,60))return NextResponse.json({message:"Ukládání je příliš časté."},{status:429});
 let text="",size=0;const reader=request.body?.getReader();if(reader){const decoder=new TextDecoder();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>DOTS_MAX_PAYLOAD){await reader.cancel();return NextResponse.json({message:"Postup je příliš velký."},{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
 let input:unknown;try{input=JSON.parse(text)}catch{return NextResponse.json({message:"Neplatný postup."},{status:422})}
 const parsed=dotsSaveSchema.safeParse(input);if(!parsed.success||!validDotsProgress(game,parsed.data.progress))return NextResponse.json({message:"Neplatný postup nebo verze hry."},{status:422});
 const client=await coloringClient(),{data,error}=await client.rpc("save_rest_activity_progress",{p_game_id:id,p_revision:parsed.data.revision,p_progress:parsed.data.progress});
 if(error?.code==="P0001"&&error.message==="activity_revision_conflict"){const current=await client.from("rest_activity_progress").select("progress,revision,updated_at").eq("activity_id","dots").eq("game_id",id).maybeSingle();return NextResponse.json({message:"Na jiném zařízení jsou novější změny.",current:current.data},{status:409});}
 if(error)return NextResponse.json({message:"Uložení se nezdařilo – zkusit znovu."},{status:error.code==="54000"?429:503});
 return NextResponse.json({item:data},{headers:{"Cache-Control":"private, no-store"}});
}

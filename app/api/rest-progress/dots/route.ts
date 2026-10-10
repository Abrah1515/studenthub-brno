import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringClient } from "@/lib/coloring-server";
import { isRestActivityEnabled } from "@/lib/rest-activities";
export async function GET(){
 if(!isRestActivityEnabled('dots'))return NextResponse.json({message:"Aktivita není dostupná."},{status:404,headers:{"Cache-Control":"private, no-store"}});
 const account=await getCurrentAccount();
 if(!account)return NextResponse.json({userId:null,items:[]},{headers:{"Cache-Control":"private, no-store"}});
 if(account.accountStatus!=="active")return NextResponse.json({message:"Účet je pozastavený."},{status:403});
 const {data,error}=await(await coloringClient()).from("rest_activity_progress").select("game_id,progress,percentage,completed,revision,updated_at").eq("activity_id","dots").order("updated_at",{ascending:false});
 if(error)return NextResponse.json({message:"Postup se nepodařilo načíst."},{status:503});
 return NextResponse.json({userId:account.id,items:data},{headers:{"Cache-Control":"private, no-store"}});
}

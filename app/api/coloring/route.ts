import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringClient } from "@/lib/coloring-server";
export async function GET() {
  const account=await getCurrentAccount();
  if(!account) return NextResponse.json({userId:null,items:[]},{headers:{"Cache-Control":"private, no-store"}});
  if(account.accountStatus!=="active") return NextResponse.json({message:"Účet je pozastavený."},{status:403});
  const {data,error}=await (await coloringClient()).from("coloring_progress").select("coloring_id,drawing,percentage,revision,updated_at,completed").order("updated_at",{ascending:false});
  if(error) return NextResponse.json({message:"Uložené omalovánky se nepodařilo načíst."},{status:503});
  return NextResponse.json({userId:account.id,items:data},{headers:{"Cache-Control":"private, no-store"}});
}

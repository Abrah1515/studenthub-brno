import { NextResponse } from "next/server";
import { getOwnedHousingListings } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){const account=await getCurrentAccount();if(!account)return NextResponse.json({message:"Nepřihlášeno."},{status:401});const city=new URL(request.url).searchParams.get("city");const items=await getOwnedHousingListings(account.id);return NextResponse.json({items:city?items.filter((item)=>item.cityId===city):items},{headers:{"Cache-Control":"private, no-store"}});}

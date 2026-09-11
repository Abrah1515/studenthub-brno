import { NextResponse } from "next/server";
import { getOwnedHousingListings } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
export const dynamic="force-dynamic";
export async function GET(){const account=await getCurrentAccount();if(!account)return NextResponse.json({message:"Nepřihlášeno."},{status:401});return NextResponse.json({items:await getOwnedHousingListings(account.id)},{headers:{"Cache-Control":"private, no-store"}});}

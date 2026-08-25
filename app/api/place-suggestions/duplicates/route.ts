import { NextResponse } from "next/server";
import { duplicatePlaces, cleanPlaceText } from "@/lib/place-community-server";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { z } from "zod";

const schema=z.object({name:z.string().trim().min(2).max(160),address:z.string().trim().min(3).max(240),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),sourceUrl:z.string().url().startsWith("https://").optional(),cityId:z.string().regex(/^[a-z0-9-]{2,80}$/).default("brno")});
export async function POST(request:Request){if(!allowRequest(`place-duplicate:${requestFingerprint(request)}`,30,60*60*1000))return NextResponse.json({message:"Limit kontrol byl vyčerpán."},{status:429});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Doplňte název, adresu a bod na mapě."},{status:422});const value=parsed.data;const matches=await duplicatePlaces({...value,name:cleanPlaceText(value.name),address:cleanPlaceText(value.address)},value.cityId);return NextResponse.json({matches});}

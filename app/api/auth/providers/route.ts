import { NextResponse } from "next/server";
import { googleAuthConfigured } from "@/lib/auth-providers";

export async function GET(){
  return NextResponse.json(
    {google:await googleAuthConfigured()},
    {headers:{"Cache-Control":"private, no-store"}},
  );
}

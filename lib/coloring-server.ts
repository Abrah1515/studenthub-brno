import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Region } from "@/lib/coloring";
import { coloringAssets } from "@/lib/coloring";

export async function coloringClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:()=>undefined}});
}
export async function coloringRegions(id: string): Promise<Region[]> {
  if (!coloringAssets.some(a=>a.id===id)) throw new Error("Unknown coloring asset");
  return JSON.parse(await readFile(join(process.cwd(),"public","coloring","v1",id,"regions.json"),"utf8"));
}

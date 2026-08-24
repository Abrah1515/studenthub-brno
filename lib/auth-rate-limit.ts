import "server-only";

import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { createServiceClient,isSupabaseConfigured } from "@/lib/supabase-server";

export async function allowAuthRequest(request:Request,action:string,limit:number,windowSeconds:number){
  const fingerprint=requestFingerprint(request);
  if(!isSupabaseConfigured())return allowRequest(`auth:${action}:${fingerprint}`,limit,windowSeconds*1000);
  const {data,error}=await createServiceClient().rpc("consume_marketplace_rate_limit",{
    p_key_hash:fingerprint,
    p_action:`auth-${action}`,
    p_limit:limit,
    p_window_seconds:windowSeconds,
  });
  if(error){
    console.error("StudentHub Auth rate limit selhal.",{action,code:error.code||"unknown"});
    return false;
  }
  return data===true;
}

import "server-only";

type AuthSettings={external?:Record<string,boolean>};

export async function googleAuthConfigured(){
  if(process.env.GOOGLE_AUTH_ENABLED!=="true")return false;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anon)return false;
  try{
    const response=await fetch(`${url.replace(/\/$/,"")}/auth/v1/settings`,{
      headers:{apikey:anon,authorization:`Bearer ${anon}`},
      cache:"no-store",
      signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)return false;
    const settings=await response.json() as AuthSettings;
    return settings.external?.google===true;
  }catch{return false;}
}

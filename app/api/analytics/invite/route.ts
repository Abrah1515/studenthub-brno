import { NextResponse } from 'next/server';
import { inviteEventSchema } from '@/lib/invite';
import { allowAuthRequest } from '@/lib/auth-rate-limit';

export async function POST(request:Request){
 const empty=()=>new NextResponse(null,{status:204,headers:{'Cache-Control':'private, no-store'}});
 if(!/(?:^|;\s*)sh_analytics_consent=1(?:;|$)/.test(request.headers.get('cookie')||''))return empty();
 if(request.headers.get('origin')!==new URL(request.url).origin)return empty();
 if(Number(request.headers.get('content-length')||0)>512)return empty();
 let text='',size=0;const reader=request.body?.getReader();
 if(reader){const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512){await reader.cancel();return empty();}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
 let input:unknown;try{input=JSON.parse(text);}catch{return empty();}
 const parsed=inviteEventSchema.safeParse(input);if(!parsed.success)return empty();
 if(!await allowAuthRequest(request,'invite-analytics',30,60))return empty();
 // Only fixed enums and a public city slug. No URL, profile, session or recipient.
 console.info('StudentHub invite event',parsed.data);
 return empty();
}

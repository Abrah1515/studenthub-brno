import { z } from 'zod';

export const inviteText='Mrkni na StudentHub. Školní termíny, akce, brigády a bydlení pro studenty najdeš přehledně na jednom místě.';
export type InviteChannel='native'|'clipboard'|'whatsapp'|'email'|'qr';
const inviteCitySchema=z.enum(['brno','praha','olomouc','ostrava']);
export function inviteCity(pathname:string,publishedSlugs:readonly string[]){
 const slug=inviteCitySchema.safeParse(pathname.split('/')[1]);
 return slug.success&&publishedSlugs.includes(slug.data)?slug.data:null;
}
export function inviteUrl(pathname:string,publishedSlugs:readonly string[],channel:InviteChannel){
 const city=inviteCity(pathname,publishedSlugs),url=new URL(city?`/${city}`:'/', 'https://studenthubapp.cz');
 url.search=new URLSearchParams({utm_source:channel,utm_medium:'share',utm_campaign:'invite_classmate'}).toString();
 return url.href;
}
export const inviteEventSchema=z.object({action:z.enum(['open','copy','native_complete']),channel:z.enum(['dialog','native','clipboard']),cityId:inviteCitySchema.nullable()}).strict();
export type InviteEvent=z.infer<typeof inviteEventSchema>;
export function trackInvite(event:InviteEvent){
 try{
  const consent=JSON.parse(localStorage.getItem('studenthub-consent')||'{}');
  if(consent.analytics!==true||!inviteEventSchema.safeParse(event).success)return;
  navigator.sendBeacon('/api/analytics/invite',new Blob([JSON.stringify(event)],{type:'application/json'}));
 }catch{/* Sdílení nikdy nezávisí na analytice. */}
}

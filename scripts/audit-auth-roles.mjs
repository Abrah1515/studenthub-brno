import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnv(path) {
  try {
    for (const line of (await readFile(path,"utf8")).split(/\r?\n/)) {
      const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
      if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,"");
    }
  } catch { /* CI může předat proměnné přímo. */ }
}
await loadEnv(".env.local");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error("Audit vyžaduje lokálně nastavené Supabase serverové údaje.");
const repair=process.argv.includes("--repair");
const bootstrap=process.argv.includes("--bootstrap-superadmin");
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[];
for(let page=1;;page+=1){const {data,error}=await client.auth.admin.listUsers({page,perPage:1000});if(error)throw error;users.push(...data.users);if(data.users.length<1000)break;}
const {data:profiles,error}=await client.from("profiles").select("id,role,city_id,faculty_id,account_status,is_blocked");if(error)throw error;
const byId=new Map((profiles||[]).map((profile)=>[profile.id,profile]));
let createdProfiles=0;let repairedMetadata=0;let invalidScopes=0;
if(bootstrap){
  const requestedEmail=process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if(!requestedEmail)throw new Error("Pro bootstrap nastavte lokální SUPERADMIN_EMAIL.");
  const target=users.find((user)=>user.email?.toLowerCase()===requestedEmail);
  if(!target?.email_confirmed_at)throw new Error("Cílový účet neexistuje nebo nemá potvrzený e-mail.");
  const targetProfile=byId.get(target.id);
  if(!targetProfile)throw new Error("Potvrzenému účtu chybí profil; nejprve spusťte pnpm admin:roles:repair.");
  const result=await client.rpc("bootstrap_first_super_admin",{p_target_id:target.id,p_reason:"Prvotní idempotentní bootstrap již potvrzeného účtu."});
  if(result.error)throw result.error;
  const metadata=target.app_metadata||{};
  const authUpdate=await client.auth.admin.updateUserById(target.id,{app_metadata:{...metadata,role:"super_admin",city_id:null,faculty_id:null}});
  if(authUpdate.error)throw authUpdate.error;
  console.log(JSON.stringify({mode:"bootstrap-superadmin",changed:Boolean(result.data?.changed)},null,2));
  process.exit(0);
}
for(const user of users){
  let profile=byId.get(user.id);
  if(!profile&&repair&&user.email_confirmed_at){
    const created=await client.from("profiles").upsert({id:user.id,display_name:"Student",role:"user"},{onConflict:"id"}).select("id,role,city_id,faculty_id,account_status,is_blocked").single();
    if(created.error)throw created.error;profile=created.data;byId.set(user.id,profile);createdProfiles+=1;
  }
  if(!profile)continue;
  if((["admin","city_editor"].includes(profile.role)&&(!profile.city_id||profile.faculty_id))||(profile.role==="faculty_editor"&&!profile.faculty_id))invalidScopes+=1;
  const metadata=user.app_metadata||{};
  const mismatch=(metadata.role||"user")!==profile.role||(metadata.city_id||null)!==(profile.city_id||null)||(metadata.faculty_id||null)!==(profile.faculty_id||null);
  if(repair&&mismatch){const updated=await client.auth.admin.updateUserById(user.id,{app_metadata:{...metadata,role:profile.role,city_id:profile.city_id||null,faculty_id:profile.faculty_id||null}});if(updated.error)throw updated.error;repairedMetadata+=1;}
}
const profileIds=new Set((profiles||[]).map((profile)=>profile.id));
const activeSuperAdmins=(profiles||[]).filter((profile)=>profile.role==="super_admin"&&profile.account_status==="active"&&!profile.is_blocked).length;
console.log(JSON.stringify({mode:repair?"repair":"audit",users:users.length,confirmedUsers:users.filter((user)=>user.email_confirmed_at).length,missingProfiles:users.filter((user)=>!profileIds.has(user.id)).length,orphanProfiles:(profiles||[]).filter((profile)=>!users.some((user)=>user.id===profile.id)).length,activeSuperAdmins,invalidScopes,createdProfiles,repairedMetadata},null,2));
if(activeSuperAdmins<1||invalidScopes>0)process.exitCode=1;

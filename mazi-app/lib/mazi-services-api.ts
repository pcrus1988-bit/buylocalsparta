import {createClient} from "./supabase/server";
const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const endpoint=()=>`${base}/functions/v1/mazi-service-api`;
const fail={ok:false as const,error:"service_unavailable"};
type Result<T extends object>=({ok:true}&T)|{ok:false;error:string};
function record(v:unknown):v is Record<string,unknown>{return Boolean(v)&&typeof v==="object"&&!Array.isArray(v);}
function parse<T extends object>(v:unknown):Result<T>{
 if(record(v)&&v.ok===true)return v as {ok:true}&T;
 return {ok:false,error:record(v)&&typeof v.error==="string"?v.error:"service_unavailable"};
}
export async function maziServiceRequest<T extends object>(operation:string,payload:Record<string,unknown>={}):Promise<Result<T>>{
 if(!base||!key)return fail;
 const db=await createClient();
 const {data:{session}}=await db.auth.getSession();
 if(!session?.access_token)return {ok:false,error:"not_authenticated"};
 try{
  const response=await fetch(endpoint(),{
   method:"POST",cache:"no-store",headers:{
    "content-type":"application/json",apikey:key,authorization:`Bearer ${session.access_token}`
   },body:JSON.stringify({operation,...payload}),signal:AbortSignal.timeout(10000)
  });
  return parse<T>(await response.json());
 }catch{return fail;}
}
export async function maziPublicServiceCatalogue<T extends object>():Promise<Result<T>>{
 if(!base||!key)return fail;
 try{
  const res=await fetch(endpoint()+"?operation=catalogue",{
   headers:{apikey:key},cache:"no-store",signal:AbortSignal.timeout(10000)
  });
  return parse<T>(await res.json());
 }catch{return fail;}
}

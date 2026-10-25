import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest} from "../../../lib/mazi-api";
import type {CommunitySnapshot} from "../../../lib/community";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
export async function GET(){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({error:"not_authenticated"},{status:401,headers:noStore});
 const result=await maziMemberRequest<CommunitySnapshot>("community_snapshot",{section:"chat"});
 return NextResponse.json(result,{status:result.ok?200:403,headers:noStore});
}
export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(!origin||origin!==request.nextUrl.origin)
   return NextResponse.json({error:"invalid_origin"},{status:403,headers:noStore});
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({error:"not_authenticated"},{status:401,headers:noStore});
 if(Number(request.headers.get("content-length")||0)>2048)
   return NextResponse.json({error:"payload_too_large"},{status:413,headers:noStore});
 let input:unknown;
 try{input=await request.json();}catch{return NextResponse.json({error:"invalid_content"},{status:400,headers:noStore});}
 if(!input||typeof input!=="object"||Array.isArray(input)||typeof (input as {body?:unknown}).body!=="string")
   return NextResponse.json({error:"invalid_content"},{status:400,headers:noStore});
 const body=(input as {body:string}).body.trim();
 if(body.length<1||body.length>1000)
   return NextResponse.json({error:"invalid_content"},{status:400,headers:noStore});
 const result=await maziMemberRequest("community_chat",{body});
 return NextResponse.json(result,{status:result.ok?200:result.error==="rate_limited"?429:403,headers:noStore});
}

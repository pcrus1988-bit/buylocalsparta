import {NextResponse} from "next/server";
import {verifyPressSns,ingestPressSnsNotification,confirmPressSnsSubscription} from "../../../../../lib/research-press-sns";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  if(Number(request.headers.get("content-length")||"0")>256*1024)
    return NextResponse.json({error:"Notification too large"},{status:413});
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>256*1024) return NextResponse.json({error:"Notification too large"},{status:413});
    body=JSON.parse(raw);
  }catch{
    return NextResponse.json({error:"Invalid JSON"},{status:400});
  }
  if(!body||typeof body!=="object"||Array.isArray(body))
    return NextResponse.json({error:"Malformed notification"},{status:400});
  const sns=body as Record<string,unknown>;
  try{await verifyPressSns(sns);}
  catch(error){
    console.warn("Rejected unsigned/misconfigured press feedback",error instanceof Error?error.message:"verification failure");
    return NextResponse.json({error:"SNS verification failed"},{status:403});
  }
  try{
    if(sns.Type==="SubscriptionConfirmation"){
      await confirmPressSnsSubscription(sns);
      return NextResponse.json({ok:true,subscriptionConfirmed:true});
    }
    const recorded=await ingestPressSnsNotification(sns);
    return NextResponse.json({ok:true,recorded});
  }catch(error){
    console.error("Authenticated Press Office SES feedback could not be persisted",error);
    return NextResponse.json({error:"Provider event processing unavailable"},{status:503});
  }
}

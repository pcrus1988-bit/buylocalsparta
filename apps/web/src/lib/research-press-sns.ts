import {X509Certificate,createVerify} from "node:crypto";
import {getProductionPostgresRuntime} from "./postgres-runtime";
import {parseSesPressEvent} from "./research-press-provider-events";

type SnsMessage=Record<string,unknown>;
const SNS_HOST="sns.eu-north-1.amazonaws.com";
const validTopic=(v:unknown):v is string=>typeof v==="string"&&/^arn:aws:sns:eu-north-1:[0-9]{12}:[A-Za-z0-9_-]+$/.test(v);
const string=(v:unknown)=>typeof v==="string"?v:"";
function trustedUrl(raw:string,forCert:boolean):URL{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!==SNS_HOST||url.port||url.username||url.password||url.hash)
    throw new Error("Untrusted SNS URL");
  if(forCert){
    if(!/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname)||url.search)
      throw new Error("Unexpected SNS certificate location");
  }else if(url.pathname!=="/"||url.searchParams.get("Action")!=="ConfirmSubscription"){
    throw new Error("Unexpected SNS confirmation URL");
  }
  return url;
}
function canonical(msg:SnsMessage):string {
  const keys=msg.Type==="Notification"
    ?["Message","MessageId","Subject","Timestamp","TopicArn","Type"]
    :["Message","MessageId","SubscribeURL","Timestamp","Token","TopicArn","Type"];
  return keys.filter(key=>key!=="Subject"||typeof msg.Subject==="string")
    .map(key=>{
      if(typeof msg[key]!=="string" || !msg[key])throw new Error("Missing SNS signed field: "+key);
      return key+"\n"+msg[key]+"\n";
    }).join("");
}
export async function verifyPressSns(msg:SnsMessage):Promise<void>{
  const arn=process.env.BLS_PRESS_SNS_TOPIC_ARN?.trim();
  if(!arn||!validTopic(arn))throw new Error("Press SNS topic not configured");
  if(msg.TopicArn!==arn)throw new Error("SNS topic mismatch");
  if(msg.Type!=="Notification"&&msg.Type!=="SubscriptionConfirmation")
    throw new Error("Unsupported SNS message type");
  const version=string(msg.SignatureVersion);
  if(version!=="1"&&version!=="2")throw new Error("Unsupported SNS signature version");
  const signature=string(msg.Signature);
  if(!signature||signature.length>4096)throw new Error("Missing SNS signature");
  const certUrl=trustedUrl(string(msg.SigningCertURL),true);
  const res=await fetch(certUrl,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(4000)});
  if(!res.ok)throw new Error("SNS signing certificate unavailable");
  const pem=await res.text();
  if(pem.length>16384)throw new Error("SNS certificate too large");
  const cert=new X509Certificate(pem);
  const now=Date.now();
  if(Date.parse(cert.validFrom)>now||Date.parse(cert.validTo)<now)
    throw new Error("SNS certificate expired or not yet valid");
  const verifier=createVerify(version==="1"?"RSA-SHA1":"RSA-SHA256");
  verifier.update(canonical(msg),"utf8");verifier.end();
  if(!verifier.verify(cert.publicKey,signature,"base64"))
    throw new Error("SNS signature verification failed");
}

export async function ingestPressSnsNotification(msg:SnsMessage):Promise<number>{
  let body:unknown;
  try{body=JSON.parse(string(msg.Message));}
  catch{throw new Error("SNS Message must contain SES JSON");}
  const events=parseSesPressEvent(body);
  if(!events.length)return 0;
  const db=getProductionPostgresRuntime().sqlPool;
  let inserted=0;
  for(const event of events){
    const suppress=event.type==="complained"||
      (event.type==="bounced"&&event.detail?.toLowerCase()!=="transient");
    // A tagged SES event may precede persistence of its provider message ID.
    // A legacy untagged SES event may match ONLY by the stored SES message ID.
    // The FK prevents storing events for arbitrary SNS recipients.
    const result=await db.query<{recorded:number}>(`
      WITH target AS (
        SELECT release_id,recipient FROM public.research_press_deliveries
        WHERE recipient=$2 AND status IN ('sending','sent')
          AND (ses_message_id=$1 OR ($3::uuid IS NOT NULL AND release_id=$3::uuid))
        LIMIT 1
      ),
      saved AS (
        INSERT INTO public.research_press_delivery_events
          (release_id,recipient,ses_message_id,sns_message_id,event_type,event_at,detail)
        SELECT release_id,recipient,$1,$4,$5,$6::timestamptz,$7 FROM target
        ON CONFLICT(sns_message_id,recipient,event_type) DO NOTHING
        RETURNING recipient
      ),
      suppressed AS (
        INSERT INTO public.research_press_suppressions(recipient,reason)
        SELECT recipient,$8 FROM saved WHERE $9::boolean
        ON CONFLICT(recipient) DO UPDATE SET reason=EXCLUDED.reason
        RETURNING recipient
      ),
      blocked AS (
        UPDATE public.research_press_deliveries d
          SET status='suppressed',updated_at=now()
        WHERE d.recipient IN (SELECT recipient FROM suppressed) AND d.status='pending'
        RETURNING recipient
      )
      SELECT count(*)::int AS recorded FROM saved`,[
      event.sesMessageId,event.recipient,event.campaignId,string(msg.MessageId),
      event.type,event.occurredAt,event.detail,
      event.type==="complained"?"ses_complaint":"ses_bounce",suppress
    ]);
    inserted+=result.rows[0]?.recorded??0;
  }
  return inserted;
}

export async function confirmPressSnsSubscription(msg:SnsMessage):Promise<void>{
  // Only a verified topic invitation reaches this branch.
  const url=trustedUrl(string(msg.SubscribeURL),false);
  const topic=string(msg.TopicArn);
  if(topic!==process.env.BLS_PRESS_SNS_TOPIC_ARN?.trim())throw new Error("Topic mismatch");
  if(url.searchParams.get("TopicArn")!==topic)throw new Error("Subscription confirmation topic mismatch");
  const res=await fetch(url,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4000)});
  if(!res.ok)throw new Error("SNS subscription confirmation failed");
}

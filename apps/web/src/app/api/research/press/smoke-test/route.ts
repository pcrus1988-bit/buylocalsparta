import {createHash,timingSafeEqual} from "node:crypto";
import {getProductionPostgresRuntime} from "../../../../../lib/postgres-runtime";
import {sesMailConfigFromEnv,sendRawSesEmail} from "../../../../../lib/admin-mail-ses";
import {buildAdminMailRawMime} from "../../../../../lib/admin-mail-mime";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const RECIPIENT="pr.kontamou@gmail.com";
const CAMPAIGN="45d500a0-a5b4-43f1-9602-ed19de4f1a67";
const TOKEN_SHA256="75064664987a264b79d3510c76abc7cb30b015aa1ee7a46341230133ac171fa4";
const EXPIRES="2026-10-17T20:59:00Z";

const response=(body:Record<string,unknown>,status=200)=>Response.json(body,{
  status,headers:{"Cache-Control":"no-store"}
});

export async function POST(request:Request){
  if(Date.now()>Date.parse(EXPIRES))return response({error:"Test expired"},410);
  const header=request.headers.get("authorization")||"";
  const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token||token.length>200)return response({error:"Not found"},404);
  const digest=createHash("sha256").update(token).digest();
  if(!timingSafeEqual(digest,Buffer.from(TOKEN_SHA256,"hex")))
    return response({error:"Not found"},404);
  const db=getProductionPostgresRuntime().sqlPool;
  const subject="[INTERNAL TEST] KONTA MOY Press Office — SES delivery verification";
  const html="<p>This is one authorized internal KONTA MOY Press Office delivery test.</p><p>No media campaign has been distributed. The provider delivery receipt will be checked separately.</p>";
  let saved:{id:string}[];
  try{
    saved=(await db.query<{id:string}>(`
      INSERT INTO public.research_press_releases (
        id,title,subject,body_html,subject_en,body_html_en,from_address,recipients,
        recipient_languages,status,created_by,prepared_at
      ) VALUES ($1,'[INTERNAL TEST] SES provider delivery check',$2,$3,$2,$3,
        'research@kontamou.site',ARRAY[$4]::text[],jsonb_build_object($4,'en'),
        'sending','press-internal-smoke-20261017',now())
      ON CONFLICT (id) DO NOTHING RETURNING id
    `,[CAMPAIGN,subject,html,RECIPIENT])).rows;
  }catch(error){
    console.error("Press smoke test failed prior to sending",error);
    return response({error:"Database unavailable before SES send"},503);
  }
  // Unique fixed campaign UUID permanently guarantees at most one send attempt.
  if(!saved.length)return response({error:"Test already attempted, no repeat will be sent",campaignId:CAMPAIGN},409);
  try {
    await db.query(`
      INSERT INTO public.research_press_deliveries
        (release_id,recipient,language,status)
      VALUES($1,$2,'en','sending')`,[CAMPAIGN,RECIPIENT]);
  }catch(error){
    console.error("Press smoke test ledger insert failed",error);
    return response({error:"Unable to prepare test ledger; no email sent",campaignId:CAMPAIGN},503);
  }
  try{
    const config=sesMailConfigFromEnv();
    if(config.region!=="eu-north-1")throw new Error("Unexpected SES region");
    const configurationSetName=process.env.BLS_PRESS_SES_CONFIGURATION_SET?.trim();
    if(configurationSetName!=="kontamou-research")throw new Error("Press SES configuration set missing");
    const mime=buildAdminMailRawMime({
      from:{name:"KONTA MOY Press Office",address:"research@kontamou.site"},
      to:[{address:RECIPIENT}],
      replyTo:[{address:"research@kontamou.site"}],
      subject,
      text:"This is a single authorized KONTA MOY SES delivery test. No media campaign has been sent.",
      html,
      internetMessageIdDomain:"kontamou.site"
    });
    const sent=await sendRawSesEmail({
      config,raw:mime.raw,from:"research@kontamou.site",to:[RECIPIENT],
      configurationSetName,
      emailTags:[{name:"pressCampaign",value:CAMPAIGN},{name:"pressLocale",value:"en"}]
    });
    await db.query(`
      UPDATE public.research_press_deliveries
      SET status='sent',ses_message_id=$2,sent_at=now(),updated_at=now(),error_message=NULL
      WHERE release_id=$1 AND recipient=$3
    `,[CAMPAIGN,sent.providerMessageId,RECIPIENT]);
    await db.query(`
      UPDATE public.research_press_releases
      SET status='completed',completed_at=now(),updated_at=now()
      WHERE id=$1`,[CAMPAIGN]);
    return response({ok:true,campaignId:CAMPAIGN,recipient:RECIPIENT,
      status:"accepted_by_SES_not_yet_confirmed_delivered",
      providerMessageId:sent.providerMessageId});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.query(`
      UPDATE public.research_press_deliveries
      SET error_message=$2,updated_at=now()
      WHERE release_id=$1 AND status='sending'`,[CAMPAIGN,message.slice(0,800)]).catch(()=>undefined);
    console.error("Press one-time SES smoke test could not confirm acceptance",{campaignId:CAMPAIGN,message});
    return response({error:"SES test did not confirm acceptance; no automatic retry",
      campaignId:CAMPAIGN,details:message.slice(0,240)},502);
  }
}

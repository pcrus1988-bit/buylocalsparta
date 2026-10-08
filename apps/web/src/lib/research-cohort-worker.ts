import { createHash, randomBytes } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertResearchSurveyEmailReady, sendResearchSurveyInvitation } from "./research-survey-mail";
import { prepareResearchCohortTick } from "./research-cohort-campaigns";

function text(v: unknown) { return typeof v === "string" ? v : String(v ?? ""); }
function sha256(v: string) { return createHash("sha256").update(v).digest("hex"); }
type Claimed = Readonly<{
  campaignId: string; recipientId: string; inviteId: string; attemptId: string;
  recipient: string; token: string; title: string; name: string; batchId: string;
  subject: string; body: string; slug: string;
}>;

async function claimOne(): Promise<Claimed | null> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout='10000ms'");
    const found = await db.query<SqlRow>([
      "SELECT rec.id AS recipient_id,rec.contact_point_id,rec.sample_unit_id,rec.campaign_id,",
      "c.invite_batch_id,b.instrument_id,b.recruitment_template_id,",
      "s.title,s.slug,rt.subject,rt.body_text,",
      "cp.contact_value,fu.sampling_attributes->>'legalName' AS legal_name",
      "FROM public.research_campaign_recipients rec",
      "JOIN public.research_recruitment_campaigns c ON c.id=rec.campaign_id",
      "JOIN public.research_studies s ON s.id=c.study_id",
      "JOIN public.research_invite_batches b ON b.id=c.invite_batch_id",
      "JOIN public.research_recruitment_templates rt ON rt.id=b.recruitment_template_id",
      "JOIN public.research_frame_units fu ON fu.id=rec.frame_unit_id",
      "LEFT JOIN research_private.contact_points_with_value cp",
      "ON cp.id=rec.contact_point_id",
      "AND cp.contact_type='email' AND cp.suppression_status='active'",
      "AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)",
      "WHERE rec.status='pending' AND c.status='running'",
      "AND s.status='fielding'",
      "AND (s.fieldwork_ends_at IS NULL OR s.fieldwork_ends_at>now())",
      "ORDER BY c.cohort_code,rec.id LIMIT 1",
      "FOR UPDATE OF rec SKIP LOCKED"
    ].join(" "));
    const row=found.rows[0];
    if (!row) { await db.query("COMMIT"); return null; }
    const campaignId=text(row.campaign_id);
    const recipientId=text(row.recipient_id);
    if (!row.contact_value || !row.sample_unit_id) {
      await db.query([
        "UPDATE public.research_campaign_recipients SET status='skipped',error_code='NO_ACTIVE_EMAIL'",
        "WHERE id=$1"
      ].join(" "),[recipientId]);
      await db.query([
        "UPDATE public.research_recruitment_campaigns SET skipped_count=skipped_count+1,updated_at=now()",
        "WHERE id=$1"
      ].join(" "),[campaignId]);
      await db.query("COMMIT");
      return { campaignId, recipientId, inviteId:"",attemptId:"",recipient:"",token:"",title:"",name:"",batchId:"",subject:"",body:"",slug:"" };
    }
    const token=randomBytes(32).toString("base64url");
    const invite = await db.query<SqlRow>([
      "INSERT INTO public.research_invites",
      "(study_id,wave_id,instrument_id,sample_unit_id,contact_point_id,batch_id,",
      "token_hash,channel,status,expires_at,fieldwork_phase)",
      "SELECT c.study_id,c.wave_id,$2,$3,$4,c.invite_batch_id,$5,'email','created',",
      "COALESCE(s.fieldwork_ends_at,now()+interval '30 days'),'main'",
      "FROM public.research_recruitment_campaigns c",
      "JOIN public.research_studies s ON s.id=c.study_id",
      "WHERE c.id=$1 AND c.status='running' RETURNING id"
    ].join(" "),[
      campaignId,row.instrument_id,row.sample_unit_id,row.contact_point_id,sha256(token)
    ]);
    if (!invite.rows[0]) throw new Error("RESEARCH_COHORT_CLAIM_NOT_RUNNING");
    const inviteId=text(invite.rows[0].id);
    const attempt=await db.query<SqlRow>([
      "INSERT INTO public.research_invite_messages",
      "(invite_id,contact_point_id,recruitment_template_id,attempt_kind,sequence_no,status,provider)",
      "VALUES ($1,$2,$3,'initial',1,'sending','ses') RETURNING id"
    ].join(" "),[inviteId,row.contact_point_id,row.recruitment_template_id]);
    await db.query([
      "INSERT INTO public.research_invite_events(invite_id,event_type,metadata)",
      "VALUES ($1,'created',jsonb_build_object('source','full_frame_campaign','cohort',$2::text))"
    ].join(" "),[inviteId,campaignId]);
    await db.query([
      "UPDATE public.research_campaign_recipients SET",
      "status='sending',claimed_at=now(),invite_id=$2 WHERE id=$1 AND status='pending'"
    ].join(" "),[recipientId,inviteId]);
    await db.query([
      "UPDATE public.research_invite_batches SET status='sending',",
      "started_at=COALESCE(started_at,now()) WHERE id=$1 AND status='ready'"
    ].join(" "),[row.invite_batch_id]);
    await db.query("COMMIT");
    return {
      campaignId, recipientId, inviteId,
      attemptId:text(attempt.rows[0]!.id), recipient:text(row.contact_value), token,
      title:text(row.title), name:text(row.legal_name), batchId:text(row.invite_batch_id),
      subject:text(row.subject), body:text(row.body_text), slug:text(row.slug)
    };
  } catch(error) {
    await db.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally { db.release(); }
}

async function completeCampaigns(): Promise<void> {
  const sql=getProductionPostgresRuntime().sqlPool;
  // Never interpret an in-flight or uncertain SES attempt as complete.
  await sql.query([
    "UPDATE public.research_recruitment_campaigns c SET status='completed',updated_at=now()",
    "WHERE c.status='running' AND NOT EXISTS (",
    "SELECT 1 FROM public.research_campaign_recipients rec",
    "WHERE rec.campaign_id=c.id AND rec.status IN ('pending','sending','uncertain'))"
  ].join(" "));
  await sql.query([
    "UPDATE public.research_invite_batches b SET status='complete',completed_at=now()",
    "FROM public.research_recruitment_campaigns c",
    "WHERE c.invite_batch_id=b.id AND c.status='completed'",
    "AND b.status IN ('ready','sending')"
  ].join(" "));
  // After a crash, do not retry unknown sends automatically: SES may have accepted them.
  await sql.query([
    "WITH stale AS (UPDATE public.research_campaign_recipients rec",
    "SET status='uncertain',error_code='SEND_RESULT_UNKNOWN'",
    "FROM public.research_recruitment_campaigns c",
    "WHERE c.id=rec.campaign_id AND c.status='running'",
    "AND rec.status='sending' AND rec.claimed_at<now()-interval '20 minutes'",
    "RETURNING rec.campaign_id)",
    "UPDATE public.research_recruitment_campaigns c",
    "SET uncertain_count=uncertain_count+x.n, status='paused',updated_at=now()",
    "FROM (SELECT campaign_id,count(*)::int AS n FROM stale GROUP BY campaign_id) x",
    "WHERE c.id=x.campaign_id"
  ].join(" "));
}

export async function tickResearchRecruitmentCampaigns(): Promise<Readonly<{
  stage: string; sent: number; uncertain: number;
}>> {
  if (!productionDatabaseConfigured()) return { stage:"unavailable",sent:0,uncertain:0 };
  // At most one page of contact hashes is prepared per tick, never a full 200k scan.
  const preparation = await prepareResearchCohortTick();
  await completeCampaigns();
  const limit=Math.max(1,Math.min(50,Number(process.env.BLS_RESEARCH_COHORT_TICK_SIZE)||25));
  const minimumIntervalMs=Math.max(1000,Math.min(10000,Number(process.env.BLS_RESEARCH_COHORT_MIN_INTERVAL_MS)||1100));
  let sent=0;
  let uncertain=0;
  for (let i=0;i<limit;i++) {
    // No campaign is approved by deploying or by this cron. 'running' is admin-only.
    const hasRunning=await getProductionPostgresRuntime().sqlPool.query<SqlRow>(
      "SELECT 1 FROM public.research_recruitment_campaigns WHERE status='running' LIMIT 1"
    );
    if (!hasRunning.rows[0]) break;
    assertResearchSurveyEmailReady();
    if (i>0) await new Promise((resolve)=>setTimeout(resolve,minimumIntervalMs));
    const claimed=await claimOne();
    if (!claimed) break;
    if (!claimed.inviteId) continue; // suppressed after snapshot freeze
    const base=(process.env.NEXT_PUBLIC_SITE_URL?.trim()||"https://kontamou.site").replace(/\/$/,"");
    try {
      const delivery=await sendResearchSurveyInvitation({
        destination:claimed.recipient,studySlug:claimed.slug,studyTitle:claimed.title,
        inviteId:claimed.inviteId,batchId:claimed.batchId,attemptId:claimed.attemptId,
        attemptKind:"initial",
        surveyUrl:base+"/research/"+encodeURIComponent(claimed.slug)+"/t/"+encodeURIComponent(claimed.token),
        methodologyUrl:base+"/research/"+encodeURIComponent(claimed.slug)+"/methodology",
        subjectTemplate:claimed.subject,bodyTemplate:claimed.body,
        companyName:claimed.name.trim()||undefined
      });
      const db=getProductionPostgresRuntime().sqlPool;
      await db.query([
        "UPDATE public.research_invites SET status='sent',sent_at=now()",
        "WHERE id=$1 AND status='created'"
      ].join(" "),[claimed.inviteId]);
      await db.query([
        "UPDATE public.research_invite_messages SET status=CASE",
        "WHEN status IN ('delivered','opened','bounced','complained') THEN status ELSE 'sent' END,",
        "provider_message_id=COALESCE(provider_message_id,$2),",
        "sent_at=COALESCE(sent_at,now()),updated_at=now() WHERE id=$1"
      ].join(" "),[claimed.attemptId,delivery.providerMessageId]);
      await db.query([
        "INSERT INTO public.research_invite_events(invite_id,event_type,metadata)",
        "VALUES ($1,'sent',jsonb_build_object('source','ses',",
        "'attemptId',$2::text,'providerMessageId',$3::text,'cohortCampaignId',$4::text))"
      ].join(" "),[claimed.inviteId,claimed.attemptId,delivery.providerMessageId,claimed.campaignId]);
      await db.query([
        "UPDATE public.research_campaign_recipients SET status='sent',sent_at=now()",
        "WHERE id=$1 AND status='sending'"
      ].join(" "),[claimed.recipientId]);
      await db.query([
        "UPDATE public.research_recruitment_campaigns",
        "SET sent_count=sent_count+1,updated_at=now() WHERE id=$1"
      ].join(" "),[claimed.campaignId]);
      sent++;
    } catch(error) {
      // Do not invent a second token or resend after ambiguous SES outcome.
      const db=getProductionPostgresRuntime().sqlPool;
      const message=(error instanceof Error?error.message:String(error)).replace(/[\r\n]/g," ").slice(0,250);
      await db.query([
        "UPDATE public.research_invite_messages SET status='failed',last_error=$2,updated_at=now()",
        "WHERE id=$1 AND status='sending'"
      ].join(" "),[claimed.attemptId,message]);
      await db.query([
        "UPDATE public.research_campaign_recipients SET status='uncertain',error_code='SES_RESULT_UNCERTAIN'",
        "WHERE id=$1 AND status='sending'"
      ].join(" "),[claimed.recipientId]);
      await db.query([
        "UPDATE public.research_recruitment_campaigns",
        "SET status='paused',uncertain_count=uncertain_count+1,updated_at=now()",
        "WHERE id=$1"
      ].join(" "),[claimed.campaignId]);
      console.error(JSON.stringify({event:"research.cohort_delivery_uncertain",
        campaignId:claimed.campaignId,recipientId:claimed.recipientId,reason:message}));
      uncertain++;
      break;
    }
  }
  if (sent) await completeCampaigns();
  return { stage:preparation.action,sent,uncertain };
}

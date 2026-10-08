import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertResearchSurveyEmailReady } from "./research-survey-mail";

const SLUG = "greek-retail-2026";
const V1 = "greek-retail-kad-sector-v1";
const V2 = "greek-retail-kad-2025-all-retail-v2";
const PAGE = 500;

function numberValue(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function pool() {
  if (!productionDatabaseConfigured()) throw new Error("RESEARCH_DATABASE_UNAVAILABLE");
  return getProductionPostgresRuntime().sqlPool;
}
export type CohortCode = "A" | "B";
export type CohortCommand = "prepare" | "approve" | "pause" | "resume" | "cancel";
function cohortCode(value: string): CohortCode {
  if (value !== "A" && value !== "B") throw new Error("RESEARCH_COHORT_INVALID");
  return value;
}

export async function researchCohortOverview(principal: SessionPrincipal): Promise<{
  campaigns: Array<{
    id: string; cohort: CohortCode; status: string; frameVersion: string;
    prepared: number; approved: number; sent: number; skipped: number;
    uncertain: number; completed: number; started: number; pending: number;
  }>;
  studyStatus: string;
}> {
  assertAdminPermission(principal, "research.read");
  const result = await pool().query<SqlRow>([
    "SELECT c.id,c.cohort_code,c.status,c.prepared_count,c.approved_count,c.sent_count,",
    "c.skipped_count,c.uncertain_count,c.frame_snapshot_id,",
    "f.selection_criteria->>'classificationVersion' AS frame_version,",
    "(SELECT count(*)::int FROM public.research_responses r",
    "JOIN public.research_invites ri ON ri.id=r.invite_id",
    "JOIN public.research_campaign_recipients rec ON rec.sample_unit_id=ri.sample_unit_id",
    "WHERE rec.campaign_id=c.id AND r.status='completed') AS completed,",
    "(SELECT count(*)::int FROM public.research_responses r",
    "JOIN public.research_invites ri ON ri.id=r.invite_id",
    "JOIN public.research_campaign_recipients rec ON rec.sample_unit_id=ri.sample_unit_id",
    "WHERE rec.campaign_id=c.id AND r.status='in_progress') AS started,",
    "s.status AS study_status",
    "FROM public.research_recruitment_campaigns c",
    "JOIN public.research_frame_snapshots f ON f.id=c.frame_snapshot_id",
    "JOIN public.research_studies s ON s.id=c.study_id",
    "WHERE s.slug=$1 AND c.wave_id=s.current_wave_id",
    "ORDER BY c.cohort_code"
  ].join(" "), [SLUG]);
  const study = await pool().query<SqlRow>("SELECT status FROM public.research_studies WHERE slug=$1", [SLUG]);
  return {
    studyStatus: text(study.rows[0]?.status),
    campaigns: result.rows.map((r) => ({
      id: text(r.id), cohort: cohortCode(text(r.cohort_code)),
      status: text(r.status), frameVersion: text(r.frame_version),
      prepared: numberValue(r.prepared_count), approved: numberValue(r.approved_count),
      sent: numberValue(r.sent_count), skipped: numberValue(r.skipped_count),
      uncertain: numberValue(r.uncertain_count), completed: numberValue(r.completed),
      started: numberValue(r.started),
      pending: Math.max(0, numberValue(r.prepared_count) - numberValue(r.sent_count) - numberValue(r.skipped_count) - numberValue(r.uncertain_count))
    }))
  };
}

export async function controlResearchCohort(
  principal: SessionPrincipal,
  input: Readonly<{
    cohort: string; command: CohortCommand; approvedCount?: number;
    reviewConfirmed?: boolean; finalConfirmed?: boolean; legalReviewConfirmed?: boolean;
  }>
): Promise<Readonly<{ cohort: CohortCode; state: string; count?: number }>> {
  assertAdminPermission(principal, "research.fieldwork.manage");
  const cohort = cohortCode(input.cohort);
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='15000ms'");
    const studies = await client.query<SqlRow>(
      "SELECT id,current_wave_id,status,title FROM public.research_studies WHERE slug=$1 FOR UPDATE",
      [SLUG]
    );
    const study = studies.rows[0];
    if (!study?.current_wave_id) throw new Error("RESEARCH_STUDY_WAVE_MISSING");
    const existing = await client.query<SqlRow>(
      "SELECT * FROM public.research_recruitment_campaigns WHERE study_id=$1 AND wave_id=$2 AND cohort_code=$3 FOR UPDATE",
      [study.id, study.current_wave_id, cohort]
    );
    let campaign = existing.rows[0];
    if (input.command === "prepare") {
      if (campaign) throw new Error("RESEARCH_COHORT_ALREADY_EXISTS");
      if (cohort === "B") {
        const first = await client.query<SqlRow>(
          "SELECT status FROM public.research_recruitment_campaigns WHERE study_id=$1 AND wave_id=$2 AND cohort_code='A'",
          [study.id, study.current_wave_id]
        );
        if (text(first.rows[0]?.status) !== "completed") throw new Error("RESEARCH_GROUP_A_MUST_FINISH_FIRST");
      }
      const version = cohort === "A" ? V1 : V2;
      const frames = await client.query<SqlRow>([
        "SELECT id FROM public.research_frame_snapshots",
        "WHERE study_id=$1 AND wave_id=$2",
        "AND selection_criteria->>'classificationVersion'=$3",
        "AND status IN ('frozen','superseded')",
        "ORDER BY frozen_at DESC NULLS LAST,created_at DESC LIMIT 1"
      ].join(" "), [study.id, study.current_wave_id, version]);
      const frame = frames.rows[0];
      if (!frame) throw new Error("RESEARCH_COHORT_FROZEN_FRAME_MISSING");
      // Draft draw is incrementally populated with ALL eligible contactable units;
      // no 100,000-member probabilistic sample cap is used for a census attempt.
      const draw = await client.query<SqlRow>([
        "INSERT INTO public.research_sample_draws",
        "(study_id,wave_id,frame_snapshot_id,label,algorithm_version,random_seed,target_n,status,fieldwork_phase)",
        "VALUES ($1,$2,$3,$4,'full-frame-contactable-census-v1',$5,1,'draft','main') RETURNING id"
      ].join(" "), [
        study.id, study.current_wave_id, frame.id,
        "Full-frame contactable outreach cohort " + cohort, "cohort-" + cohort
      ]);
      const created = await client.query<SqlRow>([
        "INSERT INTO public.research_recruitment_campaigns",
        "(study_id,wave_id,frame_snapshot_id,sample_draw_id,cohort_code)",
        "VALUES ($1,$2,$3,$4,$5) RETURNING *"
      ].join(" "), [study.id, study.current_wave_id, frame.id, draw.rows[0]!.id, cohort]);
      campaign = created.rows[0];
    } else {
      if (!campaign) throw new Error("RESEARCH_COHORT_NOT_PREPARED");
      if (input.command === "approve") {
        if (text(campaign.status) !== "review" || numberValue(campaign.prepared_count) < 1) {
          throw new Error("RESEARCH_COHORT_NOT_READY");
        }
        const count = numberValue(campaign.prepared_count);
        if (
          input.reviewConfirmed !== true || input.finalConfirmed !== true ||
          input.legalReviewConfirmed !== true ||
          Number(input.approvedCount) !== count
        ) throw new Error("RESEARCH_COHORT_DOUBLE_CONFIRMATION_REQUIRED");
        if (study.status !== "fielding") throw new Error("RESEARCH_COHORT_REQUIRES_LIVE_FIELDWORK");
        if (cohort === "B") {
          const a = await client.query<SqlRow>(
            "SELECT status FROM public.research_recruitment_campaigns WHERE wave_id=$1 AND cohort_code='A'",
            [study.current_wave_id]
          );
          if (text(a.rows[0]?.status) !== "completed") throw new Error("RESEARCH_GROUP_A_MUST_FINISH_FIRST");
        }
        assertResearchSurveyEmailReady();
        const instrument = await client.query<SqlRow>([
          "SELECT id FROM public.research_instruments WHERE study_id=$1 AND wave_id=$2",
          "AND status IN ('locked','fielding') ORDER BY created_at DESC LIMIT 1"
        ].join(" "), [study.id, study.current_wave_id]);
        const template = await client.query<SqlRow>([
          "SELECT id FROM public.research_recruitment_templates WHERE study_id=$1 AND wave_id=$2",
          "AND status='locked' AND channel='email' AND purpose='research_invitation'",
          "ORDER BY locked_at DESC NULLS LAST,created_at DESC LIMIT 1"
        ].join(" "), [study.id, study.current_wave_id]);
        if (!instrument.rows[0] || !template.rows[0]) throw new Error("RESEARCH_COHORT_LOCKED_INSTRUMENT_TEMPLATE_REQUIRED");
        const batch = await client.query<SqlRow>([
          "INSERT INTO public.research_invite_batches",
          "(study_id,wave_id,sample_draw_id,instrument_id,recruitment_template_id,label,channel,status,planned_count,fieldwork_phase)",
          "VALUES ($1,$2,$3,$4,$5,$6,'email','ready',$7,'main') RETURNING id"
        ].join(" "), [
          study.id,study.current_wave_id,campaign.sample_draw_id,instrument.rows[0].id,
          template.rows[0].id,"Full-frame cohort "+cohort,count
        ]);
        await client.query([
          "UPDATE public.research_recruitment_campaigns",
          "SET status='running',invite_batch_id=$2,approved_count=$3,approved_at=now(),",
          "approval_evidence=jsonb_build_object('purpose','research_invitation',",
          "'cohort',$4::text,'recipientCount',$3::int,'doubleConfirmed',true,",
          "'legalReviewAcknowledged',true,'confirmedAt',now()),updated_at=now() WHERE id=$1"
        ].join(" "), [campaign.id,batch.rows[0].id,count,cohort]);
      } else if (input.command === "pause") {
        if (campaign.status !== "running") throw new Error("RESEARCH_COHORT_NOT_RUNNING");
        await client.query("UPDATE public.research_recruitment_campaigns SET status='paused',updated_at=now() WHERE id=$1",[campaign.id]);
      } else if (input.command === "resume") {
        if (campaign.status !== "paused") throw new Error("RESEARCH_COHORT_NOT_PAUSED");
        if (study.status !== "fielding") throw new Error("RESEARCH_COHORT_REQUIRES_LIVE_FIELDWORK");
        assertResearchSurveyEmailReady();
        await client.query("UPDATE public.research_recruitment_campaigns SET status='running',updated_at=now() WHERE id=$1",[campaign.id]);
      } else if (input.command === "cancel") {
        if (!["preparing","review","running","paused"].includes(text(campaign.status))) throw new Error("RESEARCH_COHORT_NOT_CANCELLABLE");
        await client.query("UPDATE public.research_recruitment_campaigns SET status='cancelled',updated_at=now() WHERE id=$1",[campaign.id]);
      } else {
        throw new Error("RESEARCH_COHORT_ACTION_INVALID");
      }
    }
    await client.query("COMMIT");
    return { cohort, state: input.command === "prepare" ? "preparing" : input.command === "approve" ? "running" :
      input.command === "pause" ? "paused" : input.command === "resume" ? "running" : "cancelled",
      count: numberValue(campaign.prepared_count) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function prepareResearchCohortTick(): Promise<Readonly<{ action: string; cohort?: string; prepared?: number }>> {
  if (!productionDatabaseConfigured()) return { action: "unavailable" };
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='20000ms'");
    const matches = await client.query<SqlRow>([
      "SELECT * FROM public.research_recruitment_campaigns",
      "WHERE status='preparing' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
    ].join(" "));
    const campaign = matches.rows[0];
    if (!campaign) { await client.query("COMMIT"); return { action: "idle" }; }
    // This cursor covers EVERY unit, even those without contactable mail.
    const page = await client.query<SqlRow>([
      "SELECT fu.id,fu.external_key_hash,fu.stratum_id,",
      "cp.id AS contact_point_id,cp.contact_value_hash",
      "FROM public.research_frame_units fu",
      "LEFT JOIN LATERAL (SELECT id,contact_value_hash",
      "FROM public.research_contact_points cp",
      "WHERE cp.frame_unit_id=fu.id AND cp.contact_type='email'",
      "AND cp.suppression_status='active'",
      "AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)",
      "ORDER BY (cp.verified_at IS NOT NULL) DESC,cp.verified_at DESC NULLS LAST,cp.created_at,cp.id LIMIT 1",
      ") cp ON true",
      "WHERE fu.frame_snapshot_id=$1 AND fu.eligibility_status='eligible'",
      "AND ($2::uuid IS NULL OR fu.id>$2::uuid)",
      "ORDER BY fu.id LIMIT $3"
    ].join(" "), [campaign.frame_snapshot_id,campaign.cursor_frame_unit_id,PAGE]);
    const eligible = page.rows.filter((r) => Boolean(r.contact_point_id));
    let inserted: readonly SqlRow[] = [];
    if (eligible.length) {
      const records = JSON.stringify(eligible.map((r) => ({
        frame_unit_id:r.id, contact_point_id:r.contact_point_id,
        external_key_hash:r.external_key_hash, contact_value_hash:r.contact_value_hash
      })));
      const result = await client.query<SqlRow>([
        "WITH incoming AS (",
        "SELECT * FROM jsonb_to_recordset($1::jsonb) AS item",
        "(frame_unit_id uuid,contact_point_id uuid,external_key_hash text,contact_value_hash text)",
        ") INSERT INTO public.research_campaign_recipients",
        "(campaign_id,wave_id,frame_unit_id,contact_point_id,external_key_hash,contact_value_hash)",
        "SELECT $2,$3,x.frame_unit_id,x.contact_point_id,x.external_key_hash,x.contact_value_hash",
        "FROM incoming x WHERE NOT EXISTS (",
        "SELECT 1 FROM public.research_invites ri",
        "JOIN public.research_sample_units su ON su.id=ri.sample_unit_id",
        "JOIN public.research_frame_units prev ON prev.id=su.frame_unit_id",
        "WHERE ri.wave_id=$3 AND ri.sent_at IS NOT NULL",
        "AND (prev.external_key_hash=x.external_key_hash OR EXISTS (",
        "SELECT 1 FROM public.research_contact_points oldcp",
        "WHERE oldcp.id=ri.contact_point_id AND oldcp.contact_value_hash=x.contact_value_hash",
        "))",
        ") ON CONFLICT DO NOTHING RETURNING id,frame_unit_id"
      ].join(" "), [records,campaign.id,campaign.wave_id]);
      inserted = result.rows;
    }
    const nextCount = numberValue(campaign.prepared_count)+inserted.length;
    if (inserted.length) {
      const records = JSON.stringify(inserted.map((r) => ({ id:r.id,frame_unit_id:r.frame_unit_id })));
      await client.query<SqlRow>([
        "WITH incoming AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS item",
        "(id bigint,frame_unit_id uuid)), numbered AS (",
        "SELECT frame_unit_id,row_number() OVER (ORDER BY id) AS rn FROM incoming",
        ") INSERT INTO public.research_sample_units",
        "(sample_draw_id,frame_unit_id,stratum_id,selection_order,inclusion_probability,base_weight)",
        "SELECT $2::uuid,n.frame_unit_id,fu.stratum_id,$3::int+n.rn::int,1,1",
        "FROM numbered n JOIN public.research_frame_units fu ON fu.id=n.frame_unit_id"
      ].join(" "), [records,campaign.sample_draw_id,numberValue(campaign.prepared_count)]);
      await client.query([
        "UPDATE public.research_campaign_recipients cr SET sample_unit_id=su.id",
        "FROM public.research_sample_units su",
        "WHERE cr.campaign_id=$1 AND su.sample_draw_id=$2",
        "AND cr.frame_unit_id=su.frame_unit_id AND cr.id=ANY($3::bigint[])"
      ].join(" "), [campaign.id,campaign.sample_draw_id,inserted.map((r)=>String(r.id))]);
    }
    const done = page.rows.length < PAGE;
    if (done) {
      if (!nextCount) {
        await client.query("UPDATE public.research_recruitment_campaigns SET status='failed',updated_at=now() WHERE id=$1",[campaign.id]);
      } else {
        await client.query([
          "UPDATE public.research_sample_draws SET target_n=$2,status='locked',drawn_at=now()",
          "WHERE id=$1 AND status='draft'"
        ].join(" "),[campaign.sample_draw_id,nextCount]);
        await client.query([
          "UPDATE public.research_recruitment_campaigns SET prepared_count=$2,status='review',",
          "cursor_frame_unit_id=$3,updated_at=now() WHERE id=$1"
        ].join(" "),[campaign.id,nextCount,page.rows.at(-1)?.id ?? campaign.cursor_frame_unit_id]);
      }
    } else {
      await client.query([
        "UPDATE public.research_recruitment_campaigns SET prepared_count=$2,",
        "cursor_frame_unit_id=$3,updated_at=now() WHERE id=$1"
      ].join(" "),[campaign.id,nextCount,page.rows.at(-1)!.id]);
    }
    await client.query("COMMIT");
    return { action: done ? "prepared" : "preparing",cohort:text(campaign.cohort_code),prepared:nextCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function researchCohortEvaluation(principal: SessionPrincipal, selected: "all"|"A"|"B") {
  assertAdminPermission(principal,"research.read");
  const cohort = selected==="A" || selected==="B" ? selected : "all";
  const stats = await pool().query<SqlRow>([
    "SELECT c.cohort_code,",
    "count(DISTINCT r.id) FILTER (WHERE r.status='completed')::int AS completed,",
    "count(DISTINCT r.id) FILTER (WHERE r.status='in_progress')::int AS started,",
    "count(DISTINCT rec.id) FILTER (WHERE rec.status='sent')::int AS sent",
    "FROM public.research_recruitment_campaigns c",
    "LEFT JOIN public.research_campaign_recipients rec ON rec.campaign_id=c.id",
    "LEFT JOIN public.research_invites ri ON ri.sample_unit_id=rec.sample_unit_id",
    "LEFT JOIN public.research_responses r ON r.invite_id=ri.id",
    "JOIN public.research_studies s ON s.id=c.study_id",
    "WHERE s.slug=$1 AND c.wave_id=s.current_wave_id",
    "AND ($2::text='all' OR c.cohort_code=$2::text)",
    "GROUP BY c.cohort_code ORDER BY c.cohort_code"
  ].join(" "),[SLUG,cohort]);
  const choices = await pool().query<SqlRow>([
    "SELECT q.code,q.prompt_el, answers.answer AS answer,",
    "count(*)::int AS completed",
    "FROM public.research_answers a",
    "JOIN public.research_responses r ON r.id=a.response_id AND r.status='completed'",
    "JOIN public.research_questions q ON q.id=a.question_id",
    "CROSS JOIN LATERAL jsonb_array_elements_text(CASE",
    "WHEN q.question_type='multi' AND jsonb_typeof(a.answer)='array' THEN a.answer",
    "ELSE jsonb_build_array(a.answer) END) AS answers(answer)",
    "JOIN public.research_invites ri ON ri.id=r.invite_id",
    "JOIN public.research_campaign_recipients rec ON rec.sample_unit_id=ri.sample_unit_id",
    "JOIN public.research_recruitment_campaigns c ON c.id=rec.campaign_id",
    "JOIN public.research_studies s ON s.id=c.study_id",
    "WHERE s.slug=$1 AND c.wave_id=s.current_wave_id",
    "AND q.question_type IN ('single','multi','scale','matrix')",
    "AND ($2::text='all' OR c.cohort_code=$2::text)",
    "GROUP BY q.code,q.prompt_el,answers.answer",
    "ORDER BY q.code,completed DESC LIMIT 150"
  ].join(" "),[SLUG,cohort]);
  return {
    cohort,
    counts:stats.rows.map((r)=>({cohort:text(r.cohort_code),completed:numberValue(r.completed),
      started:numberValue(r.started),sent:numberValue(r.sent)})),
    options:choices.rows.map((r)=>({code:text(r.code),question:text(r.prompt_el),
      answer:text(r.answer),count:numberValue(r.completed)}))
  };
}

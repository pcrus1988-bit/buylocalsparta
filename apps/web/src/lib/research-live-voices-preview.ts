import "server-only";

import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import { resolveResearchAdministrativeGeography } from "./research-postcode-geography";
import {
  RESEARCH_FREE_TEXT_CATEGORIES,
  RESEARCH_FREE_TEXT_OTHER,
  categorizeResearchFreeText,
  type ResearchFreeTextCategory
} from "./research-free-text-categories";
import type { PublicVoices } from "../app/research/greek-retail-2026/results/ResearchVoiceOfGreece";
import { publicResearchQ18DisplayText } from "./research-q18-publication-moderation";

const MIN_GEOGRAPHY_CELL = 30;
const MAX_INTERNAL_QUOTE_LENGTH = 900;

/** Conservative screen; NOT a substitute for editorial de-identification.
 * All live Q18 quotes are available ONLY to principals who already have
 * permission to read raw survey answers in the admin explorer.
 */
function safeForInternalDisplay(value: string): boolean {
  if (value.length < 12 || value.length > MAX_INTERNAL_QUOTE_LENGTH) return false;
  if (/@|https?:\/\/|www\.|(?:\+30|0030)?\s*(?:69\d|2\d)(?:[\s.\-]*\d){8}|\b\d{9,}\b/i.test(value)) return false;
  return true;
}

export type LiveResearchVoices = Readonly<{
  capturedAt: string;
  eligibleQ18: number;
  displayedQ18: number;
  // Editorially unapproved internal drafts, NOT a public publication artifact.
  voices: PublicVoices;
}>;

type EligibleQ18 = Readonly<{ text: string; prefecture: string; categories: readonly ResearchFreeTextCategory[] }>;

export async function getLiveGreekRetailVoices(principal: SessionPrincipal): Promise<LiveResearchVoices> {
  assertAdminPermission(principal, "research.read");
  if (!rawResearchAnswerAccess(principal)) throw new Error("RESEARCH_RAW_Q18_FORBIDDEN");
  if (!productionDatabaseConfigured()) throw new Error("RESEARCH_LIVE_VOICES_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(`
    WITH latest_quality AS (
      SELECT DISTINCT ON (qr.response_id) qr.response_id, qr.decision
      FROM research_response_quality_reviews qr
      ORDER BY qr.response_id, qr.created_at DESC, qr.id DESC
    )
    SELECT a.id AS answer_id, a.answer #>> '{}' AS answer_text,
      COALESCE(NULLIF(NULLIF(ctx.source_prefecture,'unknown'),'Inadequate Info'),NULLIF(NULLIF(fu.sampling_attributes->>'prefecture','unknown'),'Inadequate Info'),'') AS prefecture,
      COALESCE(fu.sampling_attributes->>'postcode','') AS postcode
    FROM research_answers a
    JOIN research_responses r ON r.id=a.response_id
    JOIN research_studies s ON s.id=r.study_id AND s.slug='greek-retail-2026'
    JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=r.instrument_id
    JOIN research_invites ri ON ri.id=r.invite_id AND ri.fieldwork_phase='main'
    JOIN latest_quality quality ON quality.response_id=r.id AND quality.decision='include'
    LEFT JOIN research_sample_units su ON su.id=ri.sample_unit_id
    LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id
    WHERE r.wave_id=s.current_wave_id
      AND r.status='completed' AND r.withdrawn_at IS NULL
      AND q.code='Q18' AND q.question_type IN ('text','textarea','open_text','free_text')
      AND jsonb_typeof(a.answer)='string'
      AND length(btrim(a.answer #>> '{}'))>=12
    ORDER BY a.id
    LIMIT 5000
  `);
  const eligible: EligibleQ18[] = result.rows.flatMap(row => {
    const original = String(row.answer_text ?? "").trim();
    const content = publicResearchQ18DisplayText(Number(row.answer_id),original);
    if (content === null) return [];
    return [{
      text: content,
      prefecture: resolveResearchAdministrativeGeography(row.postcode,row.prefecture).prefectureLabel,
      categories: categorizeResearchFreeText(content)
    }];
  });

  const allCategories = [...RESEARCH_FREE_TEXT_CATEGORIES, RESEARCH_FREE_TEXT_OTHER];
  const labels = new Map<string,string>(allCategories.map(item=>[item.key,item.label]));
  const counts = new Map<string,number>(allCategories.map(item=>[item.key,0]));
  const groups = new Map<string,{eligibleN:number; categories:Map<string,number>}>();
  for (const item of eligible) {
    for (const category of item.categories) counts.set(category,(counts.get(category)??0)+1);
    if (!item.prefecture) continue;
    const group=groups.get(item.prefecture)??{eligibleN:0,categories:new Map<string,number>()};
    group.eligibleN++;
    for (const category of item.categories) group.categories.set(category,(group.categories.get(category)??0)+1);
    groups.set(item.prefecture,group);
  }

  const quotes: PublicVoices["quotes"][number][] = [];
  let eligibleForDisplay=0;
  for (const [index, item] of eligible.entries()) {
    if (!safeForInternalDisplay(item.text)) continue;
    eligibleForDisplay++;
    for (const category of item.categories) {
      quotes.push({id:"voice-"+index+"-"+category,category,text:item.text});
    }
  }
  const categories=allCategories.map(cat=>({
    key:cat.key,label:labels.get(cat.key)??cat.label,count:counts.get(cat.key)??0
  })).filter(cat=>cat.count>0);

  // Only aggregated prefecture-by-theme totals leave the server. No individual
  // quote is annotated with a prefecture, region, sector or response ID.
  const geography: PublicVoices["geography"][number][] = [];
  for (const [area,group] of groups.entries()) {
    if (group.eligibleN<MIN_GEOGRAPHY_CELL) continue;
    for (const [category,count] of group.categories.entries()) {
      if (count>=MIN_GEOGRAPHY_CELL) geography.push({
        area,category,count,eligibleN:group.eligibleN
      });
    }
  }

  if (eligible.length) await recordAdminPersonalDataAccess(principal,{
    route:"/research/greek-retail-2026/results/Preview/voices",
    resourceType:"research_free_text_answers",resourceId:"greek-retail-2026:Q18",
    purpose:"privacy_operations",dataClasses:["research_open_text_answers"],
    recordCount:eligible.length,accessScope:"bulk"
  });

  return {
    capturedAt:new Date().toISOString(),eligibleQ18:eligible.length,
    displayedQ18:eligibleForDisplay,
    voices:{categories,quotes,geography}
  };
}

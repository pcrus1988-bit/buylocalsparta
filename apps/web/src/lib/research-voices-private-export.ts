import "server-only";

import type {SessionPrincipal,SqlRow} from "@buy-local-sparta/core";
import {assertAdminPermission,recordAdminPersonalDataAccess} from "./admin-runtime";
import {rawResearchAnswerAccess} from "./research-survey-response-admin";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {
  RESEARCH_FREE_TEXT_CATEGORIES,RESEARCH_FREE_TEXT_OTHER,
  RESEARCH_FREE_TEXT_TAXONOMY_VERSION,categorizeResearchFreeText
} from "./research-free-text-categories";
import {renderResearchVoicesPdf} from "./research-voice-pdf";

const PAGE_SIZE = 1000;
const MAX_EXPORT_ANSWERS = 20000; // fail closed instead of silently publishing a partial export

/** Scrub obvious contact details before writing even to an internal export.
 * This does NOT replace editorial review for public disclosure.
 */
export function scrubResearchAnswerForInternalPdf(value: string): string {
  return value
    .replace(/(?:https?:\/\/|www\.)\S+/gi,"[αφαιρέθηκε σύνδεσμος]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[αφαιρέθηκε email]")
    .replace(/(?:\+30|0030)?\s*(?:69\d|2\d)(?:[\s.\-]*\d){8}/g,"[αφαιρέθηκε τηλέφωνο]")
    .replace(/\b\d{9,}\b/g,"[αφαιρέθηκε αριθμός]")
    .replace(/\b\d{5}\b/g,"[αφαιρέθηκε ταχυδρομικός κώδικας]");
}

export async function createInternalResearchVoicesPdf(principal:SessionPrincipal):Promise<Uint8Array> {
  assertAdminPermission(principal,"research.read");
  if(!rawResearchAnswerAccess(principal))throw new Error("RESEARCH_VOICES_EXPORT_FORBIDDEN");
  if(!productionDatabaseConfigured())throw new Error("RESEARCH_DATABASE_UNAVAILABLE");
  const pool=getProductionPostgresRuntime().sqlPool;
  const answers:{text:string;categories:string[]}[]=[];
  let offset=0;
  for(;;){
    const rows=await pool.query<SqlRow>(`
      WITH latest_quality AS (
        SELECT DISTINCT ON (qr.response_id) qr.response_id,qr.decision
        FROM research_response_quality_reviews qr
        ORDER BY qr.response_id,qr.created_at DESC,qr.id DESC
      )
      SELECT a.answer #>> '{}' AS answer_text
      FROM research_answers a
      JOIN research_responses r ON r.id=a.response_id
      JOIN research_studies s ON s.id=r.study_id AND s.slug='greek-retail-2026'
      JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=r.instrument_id
      JOIN research_invites ri ON ri.id=r.invite_id AND ri.fieldwork_phase='main'
      JOIN latest_quality quality ON quality.response_id=r.id AND quality.decision='include'
      WHERE r.wave_id=s.current_wave_id
        AND r.status='completed' AND r.withdrawn_at IS NULL
        AND q.code='Q18' AND q.question_type IN ('text','textarea','open_text','free_text')
        AND jsonb_typeof(a.answer)='string'
        AND length(btrim(a.answer #>> '{}'))>=12
      ORDER BY a.id LIMIT $1 OFFSET $2
    `,[PAGE_SIZE,offset]);
    for(const row of rows.rows){
      const text=scrubResearchAnswerForInternalPdf(String(row.answer_text??"").trim());
      if(text.length>=12) answers.push({text,categories:categorizeResearchFreeText(text)});
    }
    if(answers.length>MAX_EXPORT_ANSWERS) throw new Error("RESEARCH_VOICES_EXPORT_TOO_LARGE");
    if(rows.rows.length<PAGE_SIZE)break;
    offset+=PAGE_SIZE;
  }
  if(!answers.length)throw new Error("RESEARCH_VOICES_EXPORT_EMPTY");
  // Record the bulk export before constructing its downloadable payload.
  await recordAdminPersonalDataAccess(principal,{
    eventType:"personal_data.exported",
    route:"/api/research/greek-retail-2026/results-preview-voices-export",
    resourceType:"research_free_text_answers_export",
    resourceId:"greek-retail-2026:Q18",
    purpose:"privacy_operations",dataClasses:["research_open_text_answers"],
    recordCount:answers.length,accessScope:"bulk"
  });
  const categories=[...RESEARCH_FREE_TEXT_CATEGORIES,RESEARCH_FREE_TEXT_OTHER].map(category=>({
    key:category.key,label:category.label,
    count:answers.reduce((count,answer)=>count+(answer.categories.includes(category.key)?1:0),0)
  }));
  return renderResearchVoicesPdf({answers,categories,internal:true,taxonomyVersion:RESEARCH_FREE_TEXT_TAXONOMY_VERSION});
}

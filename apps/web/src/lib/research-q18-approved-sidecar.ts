import { createHash } from "node:crypto";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { GREEK_RETAIL_RESULTS_PUBLICATION_AT } from "./research-results-publication";
import {
  RESEARCH_FREE_TEXT_CATEGORIES, RESEARCH_FREE_TEXT_OTHER,
  categorizeResearchFreeText
} from "./research-free-text-categories";
import { publicResearchQ18DisplayText } from "./research-q18-publication-moderation";
import { scrubResearchAnswerForInternalPdf } from "./research-voices-private-export";
import { publicVoiceDataFromRelease, type PublicVoiceData } from "./research-public-voices-data";

const BUCKET="greek-retail-2026-backups";
const APPROVAL_AT="2026-10-30T16:55:00.000Z";
const MAX_ANSWERS=2000;
const MAX_BYTES=1_500_000;
const objectKey=(sha:string)=>`research/voices/${sha}/approved-v1.json`;
const sha256=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const STORAGE_SHA=/^[a-f0-9]{64}$/;

// In addition to the explicit editorial exclusion/censorship list, omit any
// comments that may carry personal identifiers or other sensitive details.
// Private originals are never modified; only approved deidentified sidecars
// can become public after the publication cutoff.
function safePublicText(id:number,raw:string):string|null {
  const moderated=publicResearchQ18DisplayText(id,raw.trim());
  if(!moderated)return null;
  const value=scrubResearchAnswerForInternalPdf(moderated).replace(/\s+/g," ").trim();
  if(value.length<12||value.length>900)return null;
  if(/@|https?:\/\/|www\.|\b(?:afm|a\.f\.m\.|αφμ|γεμη|γ\.ε\.μ\.η\.)\b/iu.test(value))return null;
  if(/ονομαζομαι|ονομάζομαι|το ονομα μου|το όνομά μου|οδό[ςυ]|διευθυνση|διεύθυνση|τηλέφωνο|κινητό μου/iu.test(value))return null;
  if(/\b\d{5,}\b/.test(value))return null;
  return value;
}

async function fetchObject(sha:string):Promise<string|undefined>{
  if(!STORAGE_SHA.test(sha))return undefined;
  const storage=serverObjectStorageFromEnv({defaultBucket:BUCKET});
  const present=await storage.head(objectKey(sha)).catch(error => { if(error instanceof Error && error.message.includes("HTTP 400"))return undefined; throw error; });
  if(!present)return undefined;
  const result=await storage.read(objectKey(sha));
  if(result.contentType?.split(";")[0].trim()!=="application/json")throw Error("RESEARCH_Q18_OBJECT_CONTENT_TYPE");
  const chunks:Uint8Array[]=[];
  let size=0;
  for await(const chunk of result.stream){
    size+=chunk.byteLength;
    if(size>MAX_BYTES)throw Error("RESEARCH_Q18_OBJECT_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Public access requires a separately released research snapshot and the
 * validated immutable, approved qualitative annex. Never query raw answers
 * or private participant metadata in a public page.
 */
export async function loadApprovedGreekRetailQ18(artifactSha:string):Promise<PublicVoiceData|undefined>{
  if(Date.now()<new Date(GREEK_RETAIL_RESULTS_PUBLICATION_AT).getTime())return undefined;
  const json=await fetchObject(artifactSha);
  if(!json)return undefined;
  const projection=JSON.parse(json) as Record<string,unknown>;
  if(projection.releaseArtifactSha256!==artifactSha)return undefined;
  return publicVoiceDataFromRelease(projection);
}
export async function archiveApprovedGreekRetailQ18(){
  if(!productionDatabaseConfigured())return {state:"not_ready"};
  const pool=getProductionPostgresRuntime().sqlPool;
  const releaseRows=await pool.query<{id:string;artifact_sha256:string}>(`
    SELECT rs.id,rs.artifact_sha256 FROM research_release_snapshots rs
    JOIN research_studies s ON s.id=rs.study_id
    JOIN research_release_archives a ON a.release_snapshot_id=rs.id
    WHERE s.slug='greek-retail-2026' AND s.status='published'
    ORDER BY rs.created_at DESC LIMIT 1
  `);
  const release=releaseRows.rows[0];
  if(!release||!STORAGE_SHA.test(release.artifact_sha256))return {state:"not_ready"};
  const existing=await fetchObject(release.artifact_sha256);
  if(existing){
    const parsed=JSON.parse(existing) as Record<string,unknown>;
    if(parsed.releaseArtifactSha256!==release.artifact_sha256 ||
       !publicVoiceDataFromRelease(parsed))throw Error("RESEARCH_Q18_EXISTING_INVALID");
    return {state:"already_verified",releaseSnapshotId:release.id};
  }
  const results=await pool.query<{answer_id:number;answer_text:string}>(`
    WITH latest AS (
      SELECT DISTINCT ON (response_id) response_id,decision
      FROM research_response_quality_reviews
      ORDER BY response_id,created_at DESC,id DESC
    )
    SELECT a.id AS answer_id,a.answer #>> '{}' AS answer_text
    FROM research_answers a
    JOIN research_responses r ON r.id=a.response_id
    JOIN research_studies s ON s.id=r.study_id AND s.slug='greek-retail-2026'
    JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=r.instrument_id
    JOIN research_invites i ON i.id=r.invite_id AND i.fieldwork_phase='main'
    JOIN latest l ON l.response_id=r.id AND l.decision='include'
    WHERE r.wave_id=s.current_wave_id AND r.status='completed'
      AND r.withdrawn_at IS NULL AND q.code='Q18'
      AND q.question_type IN ('text','textarea','open_text','free_text')
      AND jsonb_typeof(a.answer)='string'
    ORDER BY a.id
  `);
  if(results.rows.length>MAX_ANSWERS)throw Error("RESEARCH_Q18_TOO_MANY_ANSWERS");
  const candidates=results.rows.flatMap(row=>{
    const text=safePublicText(Number(row.answer_id),String(row.answer_text??""));
    return text?[{text,tags:categorizeResearchFreeText(text)}]:[];
  });
  const categories=[...RESEARCH_FREE_TEXT_CATEGORIES,RESEARCH_FREE_TEXT_OTHER].map(item=>({
    key:item.key,label:item.label,count:candidates.filter(c=>c.tags.includes(item.key)).length
  })).filter(c=>c.count>=30);
  const allowed=new Set(categories.map(c=>c.key));
  const quotes=candidates.flatMap((candidate,i)=>{
    const category=candidate.tags.find(t=>allowed.has(t));
    return category?[{id:`approved-q18-${i+1}`,category,text:candidate.text,publicApproved:true,deidentified:true}]:[];
  });
  if(!quotes.length||!categories.length)throw Error("RESEARCH_Q18_NO_SAFE_QUOTES");
  const projection={
    schema:"kontamou.research.q18-public-voices.v1",
    reviewStatus:"approved",privacyReviewed:true,geographySuppressed:true,
    approvedAt:APPROVAL_AT,releaseArtifactSha256:release.artifact_sha256,
    taxonomyVersion:"q18-themes-v2.2026-10-24",categories,quotes,geography:[]
  };
  const body=Buffer.from(JSON.stringify(projection),"utf8");

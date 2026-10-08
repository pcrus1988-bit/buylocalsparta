import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { ResearchQuestion } from "./research-survey-model";
import { researchPreviewExperimentAssignments, type ResearchSurveyContext } from "./research-survey-runtime";

/**
 * Admin-only, read-only survey discovery and instrument preview. Never touches
 * participant invitations, contacts, responses or sampling tables.
 */
export type ResearchSimulationStudy = Readonly<{
  slug: string;
  title: string;
  status: string;
  instrumentVersion?: string;
}>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function optional(value: unknown): string | undefined {
  const text = asText(value).trim();
  return text || undefined;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function listResearchSimulationStudies(principal: SessionPrincipal): Promise<readonly ResearchSimulationStudy[]> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return [];
  const result = await getAdminPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT s.slug, s.title, s.status, i.version AS instrument_version
    FROM research_studies s
    LEFT JOIN LATERAL (
      SELECT version FROM research_instruments
      WHERE study_id=s.id AND wave_id=s.current_wave_id
      ORDER BY created_at DESC LIMIT 1
    ) i ON true
    ORDER BY s.created_at DESC LIMIT 100
  `);
  return result.rows.map((row) => ({
    slug: asText(row.slug),
    title: asText(row.title),
    status: asText(row.status),
    instrumentVersion: optional(row.instrument_version)
  }));
}

export async function loadResearchSimulationContext(
  principal: SessionPrincipal,
  slug: string
): Promise<ResearchSurveyContext | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const studyResult = await pool.query<SqlRow>(`
    SELECT s.slug,s.title,s.subtitle,s.sponsor,s.population_definition,s.methodology_summary,
           s.status AS study_status, i.id AS instrument_id, i.version, i.status AS instrument_status,
           i.content_sha256, i.consent_statement_version
    FROM research_studies s
    LEFT JOIN LATERAL (
      SELECT id,version,status,content_sha256,consent_statement_version
      FROM research_instruments
      WHERE study_id=s.id AND wave_id=s.current_wave_id
      ORDER BY created_at DESC LIMIT 1
    ) i ON true
    WHERE s.slug=$1 LIMIT 1
  `, [slug]);
  const study = studyResult.rows[0];
  if (!study || !study.instrument_id) return undefined;
  const questionRows = await pool.query<SqlRow>(`
    SELECT id,code,section_code,position,question_type,prompt_el,help_el,required,analysis_key,config
    FROM research_questions WHERE instrument_id=$1 ORDER BY position,code LIMIT 300
  `, [study.instrument_id]);
  const questions: ResearchQuestion[] = questionRows.rows.map((row) => ({
    id: asText(row.id),
    code: asText(row.code),
    sectionCode: asText(row.section_code),
    position: Number(row.position ?? 0),
    type: asText(row.question_type) as ResearchQuestion["type"],
    prompt: asText(row.prompt_el),
    help: optional(row.help_el),
    required: Boolean(row.required),
    analysisKey: asText(row.analysis_key),
    config: object(row.config)
  }));
  return {
    study: {
      slug: asText(study.slug),
      title: asText(study.title),
      subtitle: optional(study.subtitle),
      sponsor: asText(study.sponsor),
      populationDefinition: asText(study.population_definition),
      methodologySummary: asText(study.methodology_summary),
      status: asText(study.study_status)
    },
    instrument: {
      version: asText(study.version),
      status: asText(study.instrument_status),
      contentSha256: asText(study.content_sha256),
      consentStatementVersion: asText(study.consent_statement_version)
    },
    invite: { status: "simulation_only" },
    questions,
    answers: {},
    experiments: questions.some((question) => question.type === "experiment")
      ? researchPreviewExperimentAssignments(slug + ":" + asText(study.version))
      : [],
    consents: {}
  };
}

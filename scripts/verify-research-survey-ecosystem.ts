import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migrationPath = "db/migrations/0414_research_survey_ecosystem.sql";
const checksumPath = "db/migrations/checksums.0414.json";
const migration = readFileSync(migrationPath, "utf8");
const checksums = JSON.parse(readFileSync(checksumPath, "utf8")) as Record<string, string>;
const runtime = readFileSync("packages/postgres-runtime/src/index.ts", "utf8");
const surveyRuntime = readFileSync("apps/web/src/lib/research-survey-runtime.ts", "utf8");
const jobs = readFileSync("apps/web/src/lib/research-survey-jobs.ts", "utf8");
const researchMail = readFileSync("apps/web/src/lib/research-survey-mail.ts", "utf8");
const sesEvents = readFileSync("apps/web/src/lib/research-survey-ses-events.ts", "utf8");
const sesSender = readFileSync("apps/web/src/lib/admin-mail-ses.ts", "utf8");
const gemi = readFileSync("apps/web/src/lib/gemi-admin-export.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

const expectedTables = [
  "research_studies",
  "research_instruments",
  "research_questions",
  "research_frame_snapshots",
  "research_strata",
  "research_frame_units",
  "research_contact_points",
  "research_sample_draws",
  "research_sample_units",
  "research_recruitment_templates",
  "research_invite_batches",
  "research_invites",
  "research_invite_events",
  "research_sample_disposition_events",
  "research_responses",
  "research_consents",
  "research_answers",
  "research_experiment_assignments",
  "research_response_quality_reviews",
  "research_reward_entitlements",
  "research_response_scores",
  "research_weights",
  "research_analysis_runs",
  "research_analysis_estimates",
  "research_release_snapshots",
  "research_study_jobs"
] as const;

const errors: string[] = [];
const sha = createHash("sha256").update(migration, "utf8").digest("hex");
if (checksums["0414_research_survey_ecosystem.sql"] !== sha) {
  errors.push("0414 checksum does not match migration bytes");
}
if (!runtime.includes("EXPECTED_SCHEMA_VERSION = 414")) errors.push("runtime schema head is not 412");
if ((migration.match(/^BEGIN;$/gm) ?? []).length !== 1) errors.push("migration must contain exactly one BEGIN");
if ((migration.match(/^COMMIT;$/gm) ?? []).length !== 1) errors.push("migration must contain exactly one COMMIT");

const created = [...migration.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)].map((match) => match[1]!);
const duplicates = created.filter((name, index) => created.indexOf(name) !== index);
if (duplicates.length) errors.push(`duplicate CREATE TABLE blocks: ${[...new Set(duplicates)].join(", ")}`);
for (const table of expectedTables) {
  if (!created.includes(table)) errors.push(`missing table ${table}`);
  if (!migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)) {
    errors.push(`RLS not enabled on ${table}`);
  }
}
if (created.length !== expectedTables.length) {
  errors.push(`expected ${expectedTables.length} research tables; found ${created.length}`);
}
if (!migration.includes("REVOKE ALL ON") || !migration.includes("FROM anon;") || !migration.includes("FROM authenticated;")) {
  errors.push("private research tables are not explicitly revoked from anon/authenticated");
}
if (!migration.includes("research_guard_answer_mutation")) errors.push("completed-answer immutability guard missing");
if (!migration.includes("research_consents_append_only")) errors.push("append-only consent ledger guard missing");
if (!migration.includes("research_sample_dispositions_append_only")) errors.push("append-only sample disposition guard missing");
if (!migration.includes("research_recruitment_templates_locked_immutable")) errors.push("locked recruitment template immutability guard missing");
if (!migration.includes("token_hash text NOT NULL UNIQUE")) errors.push("hashed invitation token contract missing");
if (/\btoken\s+text\b/i.test(migration)) errors.push("plaintext invitation token column detected");

if (!surveyRuntime.includes("SELECT DISTINCT ON (consent_kind) consent_kind, granted")) {
  errors.push("survey resume path does not read latest optional consent state");
}
if (!surveyRuntime.includes("research_response_quality_reviews")) errors.push("survey completion QA ledger missing");
if (!surveyRuntime.includes("research_reward_entitlements")) errors.push("reward entitlement separation missing");
if (!surveyRuntime.includes("research_sample_disposition_events")) errors.push("fieldwork disposition events missing");
if (!jobs.includes("gemiResearchFrameRecords")) errors.push("GEMI frame worker bridge missing");
if (!jobs.includes("stratified-hash-rank-v1")) errors.push("reproducible sample algorithm missing");
if (!jobs.includes("processInviteBatchJob")) errors.push("worker-managed invitation delivery missing");
if (!jobs.includes("runGreekRetailAnalysis(job.study_id, job.id)")) errors.push("analysis job bridge missing");
if (!jobs.includes("assertResearchSurveyEmailReady")) errors.push("research email readiness gate missing");
if (!researchMail.includes("BLS_RESEARCH_SES_CONFIGURATION_SET")) errors.push("dedicated SES configuration set gate missing");
if (!researchMail.includes("research_invite")) errors.push("SES research message tags missing");
if (!sesSender.includes("ConfigurationSetName")) errors.push("SES sender does not apply configuration set");
if (!sesEvents.includes("BLS_RESEARCH_SES_SNS_TOPIC_ARN")) errors.push("SES SNS topic allowlist missing");
if (!sesEvents.includes("SNS_SIGNATURE_INVALID")) errors.push("SNS signature verification missing");
if (!sesEvents.includes("suppression_status='bounced'")) errors.push("bounce suppression bridge missing");
if (surveyRuntime.includes("generateResearchInvitationBatch")) errors.push("legacy plaintext invitation delivery path remains");
if (surveyRuntime.includes("SURVEY_EXPERIMENT_INCOMPLETE")) errors.push("optional experiment still blocks completion");
if (!surveyRuntime.includes('"eligibilityBasis":"completed_response"')) errors.push("reward eligibility is not completion-based");
if (!gemi.includes("export async function* gemiResearchFrameRecords")) errors.push("GEMI governed record stream missing");
if (!pkg.scripts?.["worker:research"]) errors.push("research worker script missing");

if (errors.length) {
  console.error(["Research survey ecosystem verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  schema: 414,
  tables: created.length,
  migrationSha256: sha,
  worker: pkg.scripts?.["worker:research"]
}));

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migrationPath = "db/migrations/0416_research_survey_ecosystem.sql";
const checksumPath = "db/migrations/checksums.0416.json";
const suppressionMigrationPath = "db/migrations/0417_research_contact_suppression_ledger.sql";
const suppressionChecksumPath = "db/migrations/checksums.0417.json";
const deliveryMigrationPath = "db/migrations/0418_research_participant_delivery.sql";
const deliveryChecksumPath = "db/migrations/checksums.0418.json";
const reminderMigrationPath = "db/migrations/0419_research_invite_reminder_protocol.sql";
const reminderChecksumPath = "db/migrations/checksums.0419.json";
const analysisPlanMigrationPath = "db/migrations/0420_research_analysis_preregistration.sql";
const analysisPlanChecksumPath = "db/migrations/checksums.0420.json";
const securityHardeningMigrationPath = "db/migrations/0421_research_analysis_plan_function_hardening.sql";
const securityHardeningChecksumPath = "db/migrations/checksums.0421.json";
const experimentIntegrityMigrationPath = "db/migrations/0422_research_experiment_assignment_integrity.sql";
const experimentIntegrityChecksumPath = "db/migrations/checksums.0422.json";
const phaseIsolationMigrationPath = "db/migrations/0423_research_pilot_main_phase_isolation.sql";
const phaseIsolationChecksumPath = "db/migrations/checksums.0423.json";
const sampleDesignMigrationPath = "db/migrations/0424_research_sample_design_evidence.sql";
const sampleDesignChecksumPath = "db/migrations/checksums.0424.json";
const sampleDesignIntegrityMigrationPath = "db/migrations/0425_research_sample_design_integrity.sql";
const sampleDesignIntegrityChecksumPath = "db/migrations/checksums.0425.json";
const protocolEvidenceMigrationPath = "db/migrations/0426_research_protocol_evidence.sql";
const protocolEvidenceChecksumPath = "db/migrations/checksums.0426.json";
const hierarchyMigrationPath = "db/migrations/0427_research_programme_study_wave.sql";
const hierarchyChecksumPath = "db/migrations/checksums.0427.json";
const identityVaultMigrationPath = "db/migrations/0428_research_private_identity_vault.sql";
const identityVaultChecksumPath = "db/migrations/checksums.0428.json";
const roleSeparationMigrationPath = "db/migrations/0429_research_role_separation.sql";
const roleSeparationChecksumPath = "db/migrations/checksums.0429.json";
const qualityV3MigrationPath = "db/migrations/0430_research_quality_v3.sql";
const qualityV3ChecksumPath = "db/migrations/checksums.0430.json";
const populationMarginsMigrationPath = "db/migrations/0431_research_population_margins.sql";
const populationMarginsChecksumPath = "db/migrations/checksums.0431.json";
const longitudinalLineageMigrationPath = "db/migrations/0432_research_longitudinal_lineage.sql";
const longitudinalLineageChecksumPath = "db/migrations/checksums.0432.json";
const releaseArchiveMigrationPath = "db/migrations/0433_research_release_archive.sql";
const releaseArchiveChecksumPath = "db/migrations/checksums.0433.json";
const migration = readFileSync(migrationPath, "utf8");
const suppressionMigration = readFileSync(suppressionMigrationPath, "utf8");
const deliveryMigration = readFileSync(deliveryMigrationPath, "utf8");
const reminderMigration = readFileSync(reminderMigrationPath, "utf8");
const analysisPlanMigration = readFileSync(analysisPlanMigrationPath, "utf8");
const securityHardeningMigration = readFileSync(securityHardeningMigrationPath, "utf8");
const experimentIntegrityMigration = readFileSync(experimentIntegrityMigrationPath, "utf8");
const phaseIsolationMigration = readFileSync(phaseIsolationMigrationPath, "utf8");
const sampleDesignMigration = readFileSync(sampleDesignMigrationPath, "utf8");
const sampleDesignIntegrityMigration = readFileSync(sampleDesignIntegrityMigrationPath, "utf8");
const protocolEvidenceMigration = readFileSync(protocolEvidenceMigrationPath, "utf8");
const hierarchyMigration = readFileSync(hierarchyMigrationPath, "utf8");
const identityVaultMigration = readFileSync(identityVaultMigrationPath, "utf8");
const roleSeparationMigration = readFileSync(roleSeparationMigrationPath, "utf8");
const qualityV3Migration = readFileSync(qualityV3MigrationPath, "utf8");
const populationMarginsMigration = readFileSync(populationMarginsMigrationPath, "utf8");
const longitudinalLineageMigration = readFileSync(longitudinalLineageMigrationPath, "utf8");
const releaseArchiveMigration = readFileSync(releaseArchiveMigrationPath, "utf8");
const checksums = JSON.parse(readFileSync(checksumPath, "utf8")) as Record<string, string>;
const suppressionChecksums = JSON.parse(readFileSync(suppressionChecksumPath, "utf8")) as Record<string, string>;
const deliveryChecksums = JSON.parse(readFileSync(deliveryChecksumPath, "utf8")) as Record<string, string>;
const reminderChecksums = JSON.parse(readFileSync(reminderChecksumPath, "utf8")) as Record<string, string>;
const analysisPlanChecksums = JSON.parse(readFileSync(analysisPlanChecksumPath, "utf8")) as Record<string, string>;
const securityHardeningChecksums = JSON.parse(readFileSync(securityHardeningChecksumPath, "utf8")) as Record<string, string>;
const experimentIntegrityChecksums = JSON.parse(readFileSync(experimentIntegrityChecksumPath, "utf8")) as Record<string, string>;
const phaseIsolationChecksums = JSON.parse(readFileSync(phaseIsolationChecksumPath, "utf8")) as Record<string, string>;
const sampleDesignChecksums = JSON.parse(readFileSync(sampleDesignChecksumPath, "utf8")) as Record<string, string>;
const sampleDesignIntegrityChecksums = JSON.parse(readFileSync(sampleDesignIntegrityChecksumPath, "utf8")) as Record<string, string>;
const protocolEvidenceChecksums = JSON.parse(readFileSync(protocolEvidenceChecksumPath, "utf8")) as Record<string, string>;
const hierarchyChecksums = JSON.parse(readFileSync(hierarchyChecksumPath, "utf8")) as Record<string, string>;
const identityVaultChecksums = JSON.parse(readFileSync(identityVaultChecksumPath, "utf8")) as Record<string, string>;
const roleSeparationChecksums = JSON.parse(readFileSync(roleSeparationChecksumPath, "utf8")) as Record<string, string>;
const qualityV3Checksums = JSON.parse(readFileSync(qualityV3ChecksumPath, "utf8")) as Record<string, string>;
const populationMarginsChecksums = JSON.parse(readFileSync(populationMarginsChecksumPath, "utf8")) as Record<string, string>;
const longitudinalLineageChecksums = JSON.parse(readFileSync(longitudinalLineageChecksumPath, "utf8")) as Record<string, string>;
const releaseArchiveChecksums = JSON.parse(readFileSync(releaseArchiveChecksumPath, "utf8")) as Record<string, string>;
const runtime = readFileSync("packages/postgres-runtime/src/index.ts", "utf8");
const surveyRuntime = readFileSync("apps/web/src/lib/research-survey-runtime.ts", "utf8");
const surveyRoute = readFileSync("apps/web/src/app/api/research/[slug]/t/[token]/route.ts", "utf8");
const surveyForm = readFileSync("apps/web/src/components/ResearchSurveyForm.tsx", "utf8");
const schemaRollout = readFileSync(".github/workflows/research-survey-schema-rollout.yml", "utf8");
const schemaPreflight = readFileSync("scripts/research-survey-production-schema.ts", "utf8");
const jobs = readFileSync("apps/web/src/lib/research-survey-jobs.ts", "utf8");
const release = readFileSync("apps/web/src/lib/research-survey-release.ts", "utf8");
const researchMail = readFileSync("apps/web/src/lib/research-survey-mail.ts", "utf8");
const sesEvents = readFileSync("apps/web/src/lib/research-survey-ses-events.ts", "utf8");
const quality = readFileSync("apps/web/src/lib/research-survey-quality.ts", "utf8");
const qualityControls = readFileSync("apps/web/src/components/ResearchStudyQualityControls.tsx", "utf8");
const fieldworkControls = readFileSync("apps/web/src/components/ResearchStudyFieldworkControls.tsx", "utf8");
const lifecycleControls = readFileSync("apps/web/src/components/ResearchStudyLifecycleControls.tsx", "utf8");
const fieldworkBalance = readFileSync("apps/web/src/components/ResearchStudyFieldworkBalance.tsx", "utf8");
const samplingControls = readFileSync("apps/web/src/components/ResearchStudySamplingControls.tsx", "utf8");
const statistics = readFileSync("apps/web/src/lib/research-survey-statistics.ts", "utf8");
const statisticsTests = readFileSync("apps/web/src/lib/research-survey-statistics.test.ts", "utf8");
const analysis = readFileSync("apps/web/src/lib/research-survey-analysis.ts", "utf8");
const resultsPage = readFileSync("apps/web/src/app/research/greek-retail-2026/results/page.tsx", "utf8");
const methodologyPage = readFileSync("apps/web/src/app/research/greek-retail-2026/methodology/page.tsx", "utf8");
const observatoryPage = readFileSync("apps/web/src/app/research/page.tsx", "utf8");
const researchPrivacyPage = readFileSync("apps/web/src/app/research/privacy/page.tsx", "utf8");
const researchAdmin = readFileSync("apps/web/src/app/admin/research/surveys/page.tsx", "utf8");
const releaseRoute = readFileSync("apps/web/src/app/api/research/[slug]/release/route.ts", "utf8");
const sesSender = readFileSync("apps/web/src/lib/admin-mail-ses.ts", "utf8");
const gemi = readFileSync("apps/web/src/lib/gemi-admin-export.ts", "utf8");
const rbac = readFileSync("packages/core/src/auth/rbac.ts", "utf8");
const adminRuntime = readFileSync("apps/web/src/lib/admin-runtime.ts", "utf8");
const identityPersistence = readFileSync("packages/core/src/persistence/postgres-identity-trust.ts", "utf8");
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
const suppressionSha = createHash("sha256").update(suppressionMigration, "utf8").digest("hex");
const deliverySha = createHash("sha256").update(deliveryMigration, "utf8").digest("hex");
const reminderSha = createHash("sha256").update(reminderMigration, "utf8").digest("hex");
const analysisPlanSha = createHash("sha256").update(analysisPlanMigration, "utf8").digest("hex");
const securityHardeningSha = createHash("sha256").update(securityHardeningMigration, "utf8").digest("hex");
const experimentIntegritySha = createHash("sha256").update(experimentIntegrityMigration, "utf8").digest("hex");
const phaseIsolationSha = createHash("sha256").update(phaseIsolationMigration, "utf8").digest("hex");
const sampleDesignSha = createHash("sha256").update(sampleDesignMigration, "utf8").digest("hex");
const sampleDesignIntegritySha = createHash("sha256").update(sampleDesignIntegrityMigration, "utf8").digest("hex");
const protocolEvidenceSha = createHash("sha256").update(protocolEvidenceMigration, "utf8").digest("hex");
const hierarchySha = createHash("sha256").update(hierarchyMigration, "utf8").digest("hex");
const identityVaultSha = createHash("sha256").update(identityVaultMigration, "utf8").digest("hex");
const roleSeparationSha = createHash("sha256").update(roleSeparationMigration, "utf8").digest("hex");
const qualityV3Sha = createHash("sha256").update(qualityV3Migration, "utf8").digest("hex");
const populationMarginsSha = createHash("sha256").update(populationMarginsMigration, "utf8").digest("hex");
const longitudinalLineageSha = createHash("sha256").update(longitudinalLineageMigration, "utf8").digest("hex");
const releaseArchiveSha = createHash("sha256").update(releaseArchiveMigration, "utf8").digest("hex");
if (checksums["0416_research_survey_ecosystem.sql"] !== sha) {
  errors.push("0416 checksum does not match migration bytes");
}
if (suppressionChecksums["0417_research_contact_suppression_ledger.sql"] !== suppressionSha) {
  errors.push("0417 checksum does not match migration bytes");
}
if (deliveryChecksums["0418_research_participant_delivery.sql"] !== deliverySha) {
  errors.push("0418 checksum does not match migration bytes");
}
if (reminderChecksums["0419_research_invite_reminder_protocol.sql"] !== reminderSha) {
  errors.push("0419 checksum does not match migration bytes");
}
if (analysisPlanChecksums["0420_research_analysis_preregistration.sql"] !== analysisPlanSha) {
  errors.push("0420 checksum does not match migration bytes");
}
if (securityHardeningChecksums["0421_research_analysis_plan_function_hardening.sql"] !== securityHardeningSha) {
  errors.push("0421 checksum does not match migration bytes");
}
if (experimentIntegrityChecksums["0422_research_experiment_assignment_integrity.sql"] !== experimentIntegritySha) {
  errors.push("0422 checksum does not match migration bytes");
}
if (phaseIsolationChecksums["0423_research_pilot_main_phase_isolation.sql"] !== phaseIsolationSha) {
  errors.push("0423 checksum does not match migration bytes");
}
if (sampleDesignChecksums["0424_research_sample_design_evidence.sql"] !== sampleDesignSha) {
  errors.push("0424 checksum does not match migration bytes");
}
if (sampleDesignIntegrityChecksums["0425_research_sample_design_integrity.sql"] !== sampleDesignIntegritySha) {
  errors.push("0425 checksum does not match migration bytes");
}
if (protocolEvidenceChecksums["0426_research_protocol_evidence.sql"] !== protocolEvidenceSha) {
  errors.push("0426 checksum does not match migration bytes");
}
if (hierarchyChecksums["0427_research_programme_study_wave.sql"] !== hierarchySha) {
  errors.push("0427 checksum does not match migration bytes");
}
if (identityVaultChecksums["0428_research_private_identity_vault.sql"] !== identityVaultSha) {
  errors.push("0428 checksum does not match migration bytes");
}
if (roleSeparationChecksums["0429_research_role_separation.sql"] !== roleSeparationSha) {
  errors.push("0429 checksum does not match migration bytes");
}
if (qualityV3Checksums["0430_research_quality_v3.sql"] !== qualityV3Sha) {
  errors.push("0430 checksum does not match migration bytes");
}
if (populationMarginsChecksums["0431_research_population_margins.sql"] !== populationMarginsSha) {
  errors.push("0431 checksum does not match migration bytes");
}
if (longitudinalLineageChecksums["0432_research_longitudinal_lineage.sql"] !== longitudinalLineageSha) {
  errors.push("0432 checksum does not match migration bytes");
}
if (releaseArchiveChecksums["0433_research_release_archive.sql"] !== releaseArchiveSha) {
  errors.push("0433 checksum does not match migration bytes");
}
if (!runtime.includes("EXPECTED_SCHEMA_VERSION = 434")) errors.push("runtime schema head is not 434");
if (!qualityV3Migration.includes("ADD COLUMN quality_score")) errors.push("research quality score column missing");
if (!qualityV3Migration.includes("ADD COLUMN answer_pattern_sha256")) errors.push("research answer-pattern fingerprint column missing");
if (!qualityV3Migration.includes("research_quality_answer_pattern_idx")) errors.push("research answer-pattern QA index missing");
if (!longitudinalLineageMigration.includes("CREATE TABLE public.research_variable_definitions")) errors.push("longitudinal stable-variable dictionary missing");
if (!longitudinalLineageMigration.includes("CREATE TABLE public.research_variable_versions")) errors.push("wave-specific variable realizations missing");
if (!longitudinalLineageMigration.includes("CREATE TABLE public.research_question_lineage")) errors.push("question lineage registry missing");
if (!longitudinalLineageMigration.includes("CREATE TABLE public.research_harmonisation_rules")) errors.push("cross-wave harmonisation registry missing");
if (!longitudinalLineageMigration.includes("CREATE TABLE public.research_longitudinal_comparison_specs")) errors.push("pre-declared longitudinal comparison registry missing");
if (!longitudinalLineageMigration.includes("research_instruments_lock_longitudinal_registry")) errors.push("instrument lock does not freeze longitudinal lineage");
if (!releaseArchiveMigration.includes("CREATE TABLE public.research_release_archives")) errors.push("external canonical release archive registry missing");
if (!releaseArchiveMigration.includes("content_addressed_no_overwrite_v1")) errors.push("release archive no-overwrite contract missing");
if (!longitudinalLineageMigration.includes("locked longitudinal comparison requires an explicit harmonisation rule")) errors.push("longitudinal comparisons can lock without harmonisation evidence");
if (!longitudinalLineageMigration.includes("harmonisation must point from an earlier wave to a later wave")) errors.push("harmonisation direction is not wave-governed");
if (!longitudinalLineageMigration.includes("a comparability break cannot authorize a longitudinal estimate")) errors.push("comparability breaks can authorize longitudinal estimates");
if (!longitudinalLineageMigration.includes("longitudinal comparison must be locked before publication")) errors.push("longitudinal comparison can bypass lock before publication");
if (!longitudinalLineageMigration.includes("greek-retail-2026-v1")) errors.push("2026 headline-index scoring lineage missing");
if (!longitudinalLineageMigration.includes("Q(0[1-9]|1[0-8])")) errors.push("2026 core Q01-Q18 lineage seed missing");
if (!identityVaultMigration.includes("CREATE SCHEMA IF NOT EXISTS research_private")) errors.push("research private identity schema missing");
if (!identityVaultMigration.includes("CREATE TABLE research_private.contact_vault")) errors.push("research private contact vault missing");
if (!identityVaultMigration.includes("DROP COLUMN contact_value")) errors.push("raw research contact value still remains in the public contact-point table");
if (!identityVaultMigration.includes("CREATE TABLE public.research_response_design_context")) errors.push("research response design context freeze missing");
if (!identityVaultMigration.includes("CREATE TABLE public.research_identity_destruction_events")) errors.push("research identity destruction evidence ledger missing");
if (!identityVaultMigration.includes("research_private_contact_vault_platform_runtime")) errors.push("research private contact vault RLS policy missing");
if (!identityVaultMigration.includes("research_identity_destruction_events_append_only")) errors.push("research identity destruction evidence is not append-only");
if (!identityVaultMigration.includes("'identity_destruction'")) errors.push("research identity destruction job type missing");
if (!hierarchyMigration.includes("CREATE TABLE public.research_programmes")) errors.push("research programme hierarchy table missing");
if (!hierarchyMigration.includes("CREATE TABLE public.research_waves")) errors.push("research wave hierarchy table missing");
if (!hierarchyMigration.includes("ADD COLUMN programme_id")) errors.push("research study is not bound to a programme");
if (!hierarchyMigration.includes("ADD COLUMN current_wave_id")) errors.push("research study has no explicit current wave");
if (!hierarchyMigration.includes("research_waves_one_current_per_study_idx")) errors.push("research study can have multiple current waves");
if (!hierarchyMigration.includes("research_guard_wave_scope")) errors.push("research evidence wave-scope guard missing");
if (!hierarchyMigration.includes("DISABLE TRIGGER USER")) errors.push("0427 does not explicitly protect structural backfill across immutable evidence");
if (!hierarchyMigration.includes("ALTER TABLE public.research_programmes ENABLE ROW LEVEL SECURITY;")) errors.push("research programme RLS missing");
if (!hierarchyMigration.includes("ALTER TABLE public.research_waves ENABLE ROW LEVEL SECURITY;")) errors.push("research wave RLS missing");
if (!schemaPreflight.includes("expectedSourceVersion = 434")) errors.push("guarded research production rollout is not pinned to schema 0434");
if (!schemaRollout.includes("0416–0434") || !schemaRollout.includes("through schema 0434")) errors.push("research schema rollout workflow does not advertise the complete 0416–0434 chain");
if (!populationMarginsMigration.includes("CREATE TABLE public.research_population_margin_sets")) errors.push("governed population-margin set registry missing");
if (!populationMarginsMigration.includes("CREATE TABLE public.research_population_margins")) errors.push("governed population-margin cells missing");
if (!populationMarginsMigration.includes("CREATE TABLE public.research_analysis_plan_supersessions")) errors.push("analysis-plan supersession evidence missing");
if (!jobs.includes("INSERT INTO research_population_margin_sets")) errors.push("frozen-frame population margins are not materialized before sampling");
if (!jobs.includes("RESEARCH_POPULATION_MARGIN_SOURCE_HASH_MISMATCH")) errors.push("population-margin provenance hash is not fail-closed");
if (!jobs.includes("RESEARCH_POPULATION_MARGIN_REGISTRY_MISMATCH")) errors.push("population-margin registry is not verified against the frozen frame");
if (!statistics.includes("boundedRakeCalibration")) errors.push("bounded raking calibration primitive missing");
if (!statisticsTests.includes("bounded raking reproduces compatible region and sector margins")) errors.push("bounded raking convergence test missing");
if (!statisticsTests.includes("bounded raking reports infeasible extreme margins")) errors.push("bounded raking trimming failure test missing");
if (!analysis.includes("boundedRakeCalibration(")) errors.push("analysis does not apply governed bounded raking");
if (!analysis.includes("RESEARCH_CALIBRATION_MARGIN_SET_MISSING")) errors.push("analysis does not require a governed margin set");
if (!analysis.includes("RESEARCH_CALIBRATION_DID_NOT_CONVERGE")) errors.push("analysis does not fail closed on calibration non-convergence");
if (!analysis.includes('CALIBRATION_METHOD = "bounded_raking_frozen_frame_v1"')) errors.push("analysis calibration method is not versioned");
if (!analysis.includes('WEIGHT_METHOD_VERSION = "greek-retail-2026-weight-v2"')) errors.push("calibrated weight method is not versioned");
if (!analysis.includes("'within_stratum_nonresponse_plus_bounded_raking'")) errors.push("persisted research weights do not record the calibration method");
if (!analysis.includes("populationMarginSourceSha256")) errors.push("weight diagnostics do not preserve population-margin provenance");
if (analysis.includes("calibration_adjustment,final_weight,metadata\n      )\n      VALUES (\n        $1,$2,$3,$4,1,$5")) errors.push("analysis still hard-codes calibration_adjustment=1");
for (const role of ["research_superadmin","research_methodologist","research_fieldwork","research_analyst","research_publisher","research_privacy"]) {
  if (!roleSeparationMigration.includes("'" + role + "'")) errors.push(`0429 platform role constraint missing ${role}`);
  if (!rbac.includes('| "' + role + '"')) errors.push(`RBAC role union missing ${role}`);
  if (!adminRuntime.includes('"' + role + '"')) errors.push(`admin platform-role allowlist missing ${role}`);
  if (!identityPersistence.includes('"' + role + '"')) errors.push(`identity persistence allowlist missing ${role}`);
}
for (const permission of ["research.design.manage","research.fieldwork.manage","research.quality.manage","research.analysis.manage","research.publish.manage","research.privacy.manage"]) {
  if (!rbac.includes('| "' + permission + '"')) errors.push(`RBAC permission union missing ${permission}`);
}
if (!jobs.includes('assertAdminPermission(principal, "research.design.manage")')) errors.push("research sample/frame design is not permission-separated");
if (!jobs.includes('assertAdminPermission(principal, "research.fieldwork.manage")')) errors.push("research fieldwork is not permission-separated");
if (!jobs.includes('assertAdminPermission(principal, "research.analysis.manage")')) errors.push("research analysis is not permission-separated");
if (!jobs.includes('assertAdminPermission(principal, "research.privacy.manage")')) errors.push("research privacy/destruction is not permission-separated");
if (!jobs.includes('assertAdminPermission(principal, "research.publish.manage")')) errors.push("research participant results delivery is not publisher-separated");
if (!quality.includes('assertAdminPermission(principal, "research.quality.manage")')) errors.push("research quality decisions are not permission-separated");
if (!surveyRuntime.includes("'greek-retail-2026-qc-v3'")) errors.push("research completion is not using QA rule version v3");
if (!surveyRuntime.includes("duplicate_answer_pattern")) errors.push("research duplicate-pattern review signal missing");
if (!surveyRuntime.includes("duplicatePatternReviewOnly: true")) errors.push("duplicate-pattern QA is not explicitly review-only");
if (!quality.includes("quality_score")) errors.push("research QA queue does not surface quality score");
if (!release.includes('assertAdminPermission(principal, "research.publish.manage")')) errors.push("research release creation is not publisher-separated");
if (!jobs.includes("buildGreekRetailRelease(job.study_id, job.wave_id, job.id")) errors.push("release worker bridge is not wave-scoped");
if (!release.includes("RESEARCH_RELEASE_WAVE_MISSING")) errors.push("release builder does not fail closed without a wave id");
if (!release.includes("study_id,wave_id,analysis_run_id,release_version")) errors.push("release snapshot does not persist explicit wave scope");
if (!release.includes("waveId: text(release.wave_id)")) errors.push("release artifact integrity hash omits wave identity");
if (!release.includes("waveId: published.waveId")) errors.push("public release artifact reconstruction omits wave identity");
if (!jobs.includes("RESEARCH_SAMPLE_JOB_WAVE_CHANGED")) errors.push("delayed sample jobs do not fail closed when the current wave changes");
if (!jobs.includes("INSERT INTO research_frame_snapshots (\n        study_id,\n        wave_id")) errors.push("frame snapshots rely on implicit current-wave stamping");
if (!jobs.includes("INSERT INTO research_sample_draws (\n        study_id,\n        wave_id")) errors.push("sample draws rely on implicit current-wave stamping");
if (!jobs.includes("INSERT INTO research_sample_designs (\n        sample_draw_id,\n        study_id,\n        wave_id")) errors.push("sample-design evidence relies on implicit current-wave stamping");
if (!jobs.includes("study_id,wave_id,sample_draw_id,instrument_id,recruitment_template_id")) errors.push("invite batches do not persist queued wave explicitly");
if (!jobs.includes("study_id,wave_id,instrument_id,sample_unit_id,contact_point_id")) errors.push("invitations do not persist queued wave explicitly");
if (!jobs.includes("study_id,wave_id,response_id,contact_point_id,reward_entitlement_id")) errors.push("reward delivery ledger does not persist queued wave explicitly");
if (!jobs.includes("study_id,wave_id,response_id,contact_point_id,release_snapshot_id")) errors.push("results delivery ledger does not persist queued wave explicitly");
if (!jobs.includes("pri.wave_id=$11")) errors.push("main sample pilot holdout is not wave-scoped");
if (!surveyRuntime.includes("ri.wave_id AS wave_id")) errors.push("public invitation resolution does not expose immutable invite wave");
if (!surveyRuntime.includes("research_responses (study_id, wave_id, instrument_id, invite_id")) errors.push("public response creation relies on current-wave trigger defaults");
if (surveyForm.includes("answers, experimentChoices, optionalConsents, complete: true")) errors.push("questionnaire completion still bundles post-research participant preferences");
if (surveyForm.includes('current.code === "DONE" && <div className={styles.optionalConsents}>')) errors.push("participant preferences still appear inside the scientific questionnaire flow");
const genericSurveyRouteStart = surveyRoute.indexOf("const result = await savePublicResearchSurvey({");
const genericSurveyRoute = genericSurveyRouteStart >= 0 ? surveyRoute.slice(genericSurveyRouteStart) : "";
const genericSurveyRuntimeStart = surveyRuntime.indexOf("export async function savePublicResearchSurvey");
const genericSurveyRuntimeEnd = surveyRuntime.indexOf("export type ResearchFieldworkStratum", genericSurveyRuntimeStart);
const genericSurveyRuntime = genericSurveyRuntimeStart >= 0
  ? surveyRuntime.slice(genericSurveyRuntimeStart, genericSurveyRuntimeEnd >= 0 ? genericSurveyRuntimeEnd : undefined)
  : "";
if (genericSurveyRoute.includes("optionalConsents:")) errors.push("generic survey-save API still accepts optional participant preferences");
if (genericSurveyRuntime.includes("optionalConsents")) errors.push("generic survey runtime still mutates optional participant preferences");
if (!surveyRuntime.includes('throw new Error("RESEARCH_PREFERENCES_REQUIRE_COMPLETION")')) errors.push("participant preference endpoint does not require questionnaire completion");
if (!surveyRuntime.includes("s.current_wave_id AS wave_id")) errors.push("research lifecycle does not bind to the study current wave");
if (!surveyRuntime.includes("AND rs.wave_id=$2")) errors.push("release publication is not current-wave scoped");
if (!surveyRuntime.includes("INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)")) errors.push("runtime-created participant jobs rely on implicit current-wave stamping");
if (!surveyRuntime.includes('assertAdminPermission(principal, "research.quality.manage")')) errors.push("research protocol governance is not permission-separated");
if (jobs.includes('assertAdminPermission(principal, "research.manage")') || quality.includes('assertAdminPermission(principal, "research.manage")') || release.includes('assertAdminPermission(principal, "research.manage")')) {
  errors.push("research mutation paths still collapse to research.manage");
}
if (!sampleDesignMigration.includes("CREATE TABLE public.research_sample_designs")) errors.push("sample design evidence table missing");
if (!sampleDesignMigration.includes("CREATE TABLE public.research_sample_design_strata")) errors.push("sample design stratum evidence table missing");
if (!sampleDesignMigration.includes("research_sample_designs_immutable")) errors.push("sample design immutability trigger missing");
if (!sampleDesignMigration.includes("research_sample_design_strata_immutable")) errors.push("sample design stratum immutability trigger missing");
if (!sampleDesignMigration.includes("research_sample_draws_id_study_phase_unique")) errors.push("sample design draw/study/phase foreign-key anchor missing");
if (!sampleDesignMigration.includes("ALTER TABLE public.research_sample_designs ENABLE ROW LEVEL SECURITY;")) errors.push("sample design RLS missing");
if (!sampleDesignMigration.includes("ALTER TABLE public.research_sample_design_strata ENABLE ROW LEVEL SECURITY;")) errors.push("sample design stratum RLS missing");
if (!sampleDesignIntegrityMigration.includes("research_sample_designs_insert_guard")) errors.push("sample design insert guard missing");
if (!sampleDesignIntegrityMigration.includes("research_sample_design_strata_insert_guard")) errors.push("sample design stratum insert guard missing");
if (!sampleDesignIntegrityMigration.includes("research sample design selected n does not match persisted sample units")) errors.push("sample design persisted-selection guard missing");
if (!sampleDesignIntegrityMigration.includes("FROM PUBLIC;")) errors.push("sample design insert guard is not revoked from PUBLIC");
if (!protocolEvidenceMigration.includes("CREATE TABLE public.research_protocol_events")) errors.push("protocol evidence table missing");
if (!protocolEvidenceMigration.includes("research_protocol_events_immutable")) errors.push("protocol evidence immutability trigger missing");
if (!protocolEvidenceMigration.includes("research_protocol_events_platform_runtime")) errors.push("protocol evidence RLS policy missing");
if (!protocolEvidenceMigration.includes("research protocol evidence is immutable")) errors.push("protocol evidence mutation guard missing");
if (!reminderMigration.includes("CREATE TABLE public.research_invite_access_tokens")) errors.push("reminder access-token table missing");
if (!reminderMigration.includes("CREATE TABLE public.research_invite_messages")) errors.push("invitation attempt ledger missing");
if (!reminderMigration.includes("ALTER TABLE public.research_invite_access_tokens ENABLE ROW LEVEL SECURITY;")) errors.push("reminder access-token RLS missing");
if (!reminderMigration.includes("ALTER TABLE public.research_invite_messages ENABLE ROW LEVEL SECURITY;")) errors.push("invitation attempt RLS missing");
if (!reminderMigration.includes("'invite_reminder'")) errors.push("invite_reminder job type missing from schema");
if (!analysisPlanMigration.includes("CREATE TABLE public.research_analysis_plans")) errors.push("analysis preregistration table missing");
if (!analysisPlanMigration.includes("research_analysis_plans_one_locked_per_instrument_idx")) errors.push("single locked analysis-plan invariant missing");
if (!analysisPlanMigration.includes("research_analysis_plans_locked_immutable")) errors.push("locked analysis-plan immutability guard missing");
if (!analysisPlanMigration.includes("ADD COLUMN analysis_plan_id")) errors.push("analysis runs are not bound to an analysis plan");
if (!analysisPlanMigration.includes("kontamou.research.analysis-plan.v1")) errors.push("seeded analysis-plan contract missing");
if (!analysisPlanMigration.includes("prespecified_secondary")) errors.push("pre-specified secondary analysis classification missing from plan");
if (!securityHardeningMigration.includes("ALTER FUNCTION public.research_prepare_analysis_plan()\n  SECURITY INVOKER;")) {
  errors.push("analysis-plan prepare trigger remains SECURITY DEFINER");
}
if (!securityHardeningMigration.includes("ALTER FUNCTION public.research_guard_analysis_plan_delete()\n  SECURITY INVOKER;")) {
  errors.push("analysis-plan delete guard remains SECURITY DEFINER");
}
if (!securityHardeningMigration.includes("FROM PUBLIC;")
    || !securityHardeningMigration.includes("rolname = 'anon'")
    || !securityHardeningMigration.includes("rolname = 'authenticated'")
    || !securityHardeningMigration.includes("FROM anon;")
    || !securityHardeningMigration.includes("FROM authenticated;")) {
  errors.push("analysis-plan trigger functions are not revoked from public API roles");
}
if (!securityHardeningMigration.includes("TO bls_platform_runtime;")) {
  errors.push("analysis-plan trigger execution is not restricted to platform runtime");
}
if (!experimentIntegrityMigration.includes("research_guard_experiment_assignment_mutation")) {
  errors.push("experiment assignment mutation guard missing");
}
if (!experimentIntegrityMigration.includes("RESEARCH_EXPERIMENT_RANDOMIZATION_IMMUTABLE")) {
  errors.push("experiment profile randomization immutability guard missing");
}
if (!experimentIntegrityMigration.includes("RESEARCH_EXPERIMENT_CHOICE_CLOSED")) {
  errors.push("completed experiment choice immutability guard missing");
}
if (!experimentIntegrityMigration.includes("SECURITY INVOKER")) {
  errors.push("experiment assignment guard is not security invoker");
}
if (!phaseIsolationMigration.includes("fieldwork_phase text NOT NULL DEFAULT 'main'")) {
  errors.push("pilot/main fieldwork phase columns missing");
}
if (!phaseIsolationMigration.includes("pilot_started_at") || !phaseIsolationMigration.includes("pilot_ended_at")) {
  errors.push("pilot timing boundary missing");
}
if (!phaseIsolationMigration.includes("research_invite_batches_draw_phase_fk")
    || !phaseIsolationMigration.includes("research_invites_batch_phase_fk")) {
  errors.push("pilot/main phase consistency foreign keys missing");
}
if (!experimentIntegrityMigration.includes("FROM PUBLIC;")
    || !experimentIntegrityMigration.includes("rolname = 'anon'")
    || !experimentIntegrityMigration.includes("rolname = 'authenticated'")) {
  errors.push("experiment guard function is not removed from public API roles");
}
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
if (!migration.includes("research_frame_snapshots_frozen_immutable")) errors.push("frozen frame immutability guard missing");
if (!migration.includes("research_sample_draws_locked_immutable")) errors.push("locked sample immutability guard missing");
if (!migration.includes("research_analysis_runs_succeeded_immutable")) errors.push("succeeded analysis immutability guard missing");
if (!migration.includes("research_analysis_estimates_frozen_with_run")) errors.push("analysis estimate immutability guard missing");
if (!migration.includes("research_weights_frozen_with_analysis")) errors.push("analysis weight immutability guard missing");
if (!migration.includes("research_release_snapshots_immutable")) errors.push("release snapshot immutability guard missing");
if (!suppressionMigration.includes("CREATE TABLE public.research_contact_suppression_events")) errors.push("cross-wave suppression ledger missing");
if (!suppressionMigration.includes("research_contact_suppression_events_append_only")) errors.push("suppression ledger append-only guard missing");
if (!suppressionMigration.includes("research_contact_is_suppressed")) errors.push("suppression state helper missing");
if (!suppressionMigration.includes("schema_415_backfill")) errors.push("existing suppression backfill missing");
if (!deliveryMigration.includes("CREATE TABLE public.research_participant_deliveries")) errors.push("participant delivery ledger missing");
if (!deliveryMigration.includes("CREATE TABLE public.research_participant_delivery_events")) errors.push("participant delivery event ledger missing");
if (!deliveryMigration.includes("research_participant_delivery_events_append_only")) errors.push("participant delivery event append-only guard missing");
if (!deliveryMigration.includes("ALTER TABLE public.research_participant_deliveries ENABLE ROW LEVEL SECURITY;")) errors.push("participant delivery ledger RLS missing");
if (!deliveryMigration.includes("ALTER TABLE public.research_participant_delivery_events ENABLE ROW LEVEL SECURITY;")) errors.push("participant delivery events RLS missing");
if (!deliveryMigration.includes("'reward_delivery'") || !deliveryMigration.includes("'results_notification'")) errors.push("participant delivery job types missing");
if (!migration.includes("token_hash text NOT NULL UNIQUE")) errors.push("hashed invitation token contract missing");
if (/\btoken\s+text\b/i.test(migration)) errors.push("plaintext invitation token column detected");

if (!surveyRuntime.includes("SELECT DISTINCT ON (consent_kind) consent_kind, granted")) {
  errors.push("survey resume path does not read latest optional consent state");
}
if (!surveyRuntime.includes("updatePublicResearchConsents")) errors.push("post-completion consent update runtime missing");
if (!surveyRuntime.includes("survey_ui_preferences")) errors.push("post-completion consent events are not source-labelled");
if (!surveyRuntime.includes("participant_consent_revoked")) errors.push("consent revocation does not cancel unsent participant deliveries");
if (!surveyRoute.includes('body.action === "preferences"')) errors.push("token API preference action missing");
if (!surveyForm.includes("Αποθήκευση επιλογών")) errors.push("completed survey preference controls missing");
if (!surveyRuntime.includes("AS delivered") || !surveyRuntime.includes("AS opened")) errors.push("admin fieldwork funnel event counts missing");
if (!surveyRuntime.includes("researchFieldworkStrata")) errors.push("sampling-stratum fieldwork balance query missing");
if (!surveyRuntime.includes("sample_counts AS") || !surveyRuntime.includes("response_counts AS")) errors.push("stratum fieldwork balance is not aggregated by CTE");
if (!fieldworkBalance.includes("Fieldwork balance · sampling strata")) errors.push("stratum fieldwork balance admin view missing");
if (!fieldworkBalance.includes("additional sampling strata")) errors.push("full stratum fieldwork balance is not inspectable");

if (!surveyRuntime.includes("research_response_quality_reviews")) errors.push("survey completion QA ledger missing");
if (!surveyRuntime.includes("research_reward_entitlements")) errors.push("reward entitlement separation missing");
if (!surveyRuntime.includes("research_sample_disposition_events")) errors.push("fieldwork disposition events missing");
if (!surveyRuntime.includes("'fieldwork_closeout'")) errors.push("fieldwork closeout disposition sealing missing");
if (!surveyRuntime.includes("RESEARCH_FIELDWORK_CLOSE_CONTACT_JOB_RUNNING")) errors.push("fieldwork close does not guard running contact jobs");
if (!surveyRuntime.includes("cancelled_by_fieldwork_closeout")) errors.push("fieldwork close does not cancel queued contact jobs");
if (!surveyRuntime.includes("greek-retail-2026-fieldwork-closeout-v1")) errors.push("fieldwork closeout version marker missing");
if (!jobs.includes("gemiResearchFrameRecords")) errors.push("GEMI frame worker bridge missing");
if (!jobs.includes("stratified-hash-rank-v2")) errors.push("minimum-aware reproducible sample algorithm missing");
if (!jobs.includes("RESEARCH_SAMPLE_REDRAW_AFTER_CONTACT")) errors.push("sample draw is not frozen after participant contact");
if (!jobs.includes("RESEARCH_PILOT_SAMPLE_TARGET_INVALID")) errors.push("pilot diagnostic sample bounds are not separated from main sampling");
if (!jobs.includes("pfu.external_key_hash=fu.external_key_hash")) errors.push("pilot holdout does not survive frame refreshes");
if (!jobs.includes("processInviteBatchJob")) errors.push("worker-managed invitation delivery missing");
if (!jobs.includes("processRewardDeliveryJob")) errors.push("worker-managed reward delivery missing");
if (!jobs.includes("processResultsNotificationJob")) errors.push("worker-managed results notification missing");
if (!jobs.includes("createHmac")) errors.push("deterministic non-plaintext reward code derivation missing");
if (!jobs.includes("research_participant_deliveries")) errors.push("participant delivery ledger worker bridge missing");
if (!jobs.includes("runGreekRetailAnalysis(job.study_id, job.wave_id, job.id)")) errors.push("wave-scoped analysis job bridge missing");
if (!jobs.includes('job.job_type === "release"')) errors.push("release job bridge missing");
if (!jobs.includes("buildGreekRetailRelease")) errors.push("release worker implementation missing");
if (!jobs.includes("assertResearchSurveyEmailReady")) errors.push("research email readiness gate missing");
if (!researchMail.includes("BLS_RESEARCH_SES_CONFIGURATION_SET")) errors.push("dedicated SES configuration set gate missing");
if (!researchMail.includes("research_invite")) errors.push("SES research message tags missing");
if (!researchMail.includes("sendResearchThankYouCode")) errors.push("thank-you code email workflow missing");
if (!researchMail.includes("sendResearchResultsNotification")) errors.push("results notification email workflow missing");
if (!researchMail.includes("research_delivery")) errors.push("participant delivery SES tags missing");
if (!sesSender.includes("ConfigurationSetName")) errors.push("SES sender does not apply configuration set");
if (!sesEvents.includes("BLS_RESEARCH_SES_SNS_TOPIC_ARN")) errors.push("SES SNS topic allowlist missing");
if (!sesEvents.includes("SNS_SIGNATURE_INVALID")) errors.push("SNS signature verification missing");
if (!sesEvents.includes("suppression_status='bounced'")) errors.push("bounce suppression bridge missing");
if (!sesEvents.includes("research_contact_suppression_events")) errors.push("SES events do not persist cross-wave suppression");
if (!sesEvents.includes("research_participant_delivery_events")) errors.push("SES events do not audit participant delivery outcomes");
if (!sesEvents.includes("provider_message_not_research_message")) errors.push("SES event routing does not recognize participant messages");
if (!sesEvents.includes('eventType === "DeliveryDelay"')) errors.push("SES delivery-delay callback handling missing");
if (!sesEvents.includes("deliveryDelayMetadata")) errors.push("SES delivery-delay diagnostics are not normalized");
if (!surveyRuntime.includes("researchDeliveryDelayQueue")) errors.push("admin SES delivery-delay diagnostic queue missing");
if (!researchAdmin.includes("Temporarily delayed") || !researchAdmin.includes("SES delivery delays")) errors.push("admin SES delivery-delay status surface missing");
if (!jobs.includes("pending_delay.last_error LIKE 'SES delivery delay:%'")) errors.push("automatic reminders do not pause for active SES delivery delays");
if (!jobs.includes("research_contact_is_suppressed")) errors.push("research worker does not enforce cross-wave suppression");
if (!jobs.includes("queueGreekRetailInviteReminderBatch")) errors.push("governed reminder queue missing");
if (!jobs.includes("processInviteReminderJob")) errors.push("governed reminder worker missing");
if (!jobs.includes('"invite_reminder"') || !jobs.includes("job_type = ANY($1::text[])")) errors.push("reminder jobs are not claimable by a governed research executor");
if (!jobs.includes("PRIOR_ATTEMPT_NOT_RETRIED")) errors.push("reminder retries are not fail-closed");
if (!jobs.includes("attemptKind: \"reminder\"")) errors.push("reminder SES attempt tagging missing");
if (!surveyRuntime.includes("research_invite_access_tokens")) errors.push("public survey does not resolve token aliases");
if (!fieldworkControls.includes("Automatic reminder protocol") || !fieldworkControls.includes("Run reminder check now")) errors.push("automatic reminder controls missing");
if (!sesEvents.includes("research_attempt")) errors.push("SES callback attempt recovery missing");
if (!sesEvents.includes("research_invite_messages")) errors.push("SES callback does not update attempt ledger");
if (!release.includes("denominatorRule")) errors.push("release does not freeze reminder denominator rule");
if (!statistics.includes("researchFieldworkOutcomeSummary")) errors.push("fieldwork outcome denominator function missing");
if (!release.includes("RESEARCH_RELEASE_REQUIRES_SEALED_FIELDWORK_DISPOSITIONS")) errors.push("release does not require sealed final sample dispositions");
if (!release.includes("outcomeSummary: fieldworkOutcome")) errors.push("release does not freeze fieldwork outcome summary");
if (!release.includes("contactAttempts")) errors.push("release does not freeze contact-attempt paradata");
if (!surveyRuntime.includes("participant_research_opt_out")) errors.push("participant future-research opt-out path missing");
if (!quality.includes("researchQualityReviewQueue")) errors.push("manual research QA queue missing");
if (!quality.includes("ri.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END")) errors.push("manual QA queue is not fieldwork-phase scoped");
if (!quality.includes("resolveResearchQualityReview")) errors.push("manual research QA resolver missing");
if (!quality.includes("FOR UPDATE OF rr")) errors.push("manual research QA resolution is not serialized");
if (!qualityControls.includes('void resolve(item, "include")')) errors.push("research QA include control missing");
if (!qualityControls.includes('void resolve(item, "exclude")')) errors.push("research QA exclude control missing");
if (!fieldworkControls.includes("pendingQualityReviews > 0")) errors.push("analysis UI is not gated on pending research QA");
if (!lifecycleControls.includes('analysisPlanStatus === "locked"')) errors.push("lifecycle UI does not mirror locked analysis-plan gate");
if (!lifecycleControls.includes("RESEARCH_PILOT_REQUIRES_LOCKED_ANALYSIS_PLAN")) errors.push("lifecycle UI does not explain preregistration gate failures");
if (!statistics.includes("proportionalStratumAllocation")) errors.push("minimum-aware sample allocation helper missing");
if (!statistics.includes("stratifiedSrsMeanVariance")) errors.push("design-aware variance helper missing");
if (!statistics.includes("researchWeightDiagnostics")) errors.push("weighting effective-sample diagnostics missing");

if (!statistics.includes("unequal_within_stratum_weights")) errors.push("variance guard for unequal stratum weights missing");
if (!analysis.includes('VARIANCE_METHOD = "stratified_srs_fpc_v1"')) errors.push("analysis variance method is not versioned");
if (!analysis.includes("'weightDiagnostics',$3::jsonb")) errors.push("analysis run does not persist weighting diagnostics");
if (!statistics.includes("normalTwoSidedPValue")) errors.push("pairwise normal p-value helper missing");
if (!analysis.includes('ANALYSIS_CODE_VERSION = "greek-retail-2026-analysis-v7"')) errors.push("analysis code version is not v7");
if (!analysis.includes("ri.fieldwork_phase='main'")) errors.push("analysis does not isolate main-fieldwork responses");
if (!jobs.includes("pri.sent_at IS NOT NULL")) errors.push("main sample does not durably exclude pilot-exposed businesses");
if (!surveyRuntime.includes("RESEARCH_PILOT_CLOSE_CONTACT_JOB_RUNNING")) errors.push("pilot closeout does not guard running contact jobs");
if (!surveyRuntime.includes("RESEARCH_FIELDWORK_CLOSE_REQUIRES_MAIN_SAMPLE")) errors.push("main fieldwork can close without a governed sample");
if (!surveyRuntime.includes("'sample_draw','invite_batch','invite_reminder'")) errors.push("fieldwork phase transitions do not serialize sample/contact jobs");
if (!surveyRuntime.includes("phasePopulation: numberValue(row.phase_population)")) errors.push("admin sample planner is not using phase-aware population");
if (!surveyRuntime.includes("pilot_ended_at")) errors.push("pilot closeout timestamp missing");
if (!release.includes("exposedUnitsExcludedFromMainDraw")) errors.push("release does not disclose pilot holdout");
if (!release.includes('phase: "main"')) errors.push("release does not identify main fieldwork phase");
if (!statistics.includes("weightedClusteredDifferenceInMeans")) errors.push("respondent-clustered experimental estimator missing");
if (!statisticsTests.includes("clustered experimental contrast keeps repeated profile evaluations inside respondent clusters")) errors.push("experimental clustered estimator test missing");
if (!analysis.includes("randomized_profile_amce_clustered_v1")) errors.push("randomized profile experiment analysis missing");
if (!analysis.includes('analysisClassification: "exploratory_not_preregistered"')) errors.push("experimental analysis is not explicitly labelled non-preregistered");
if (!analysis.includes("experiments: (experimentsByResponse.get(response.responseId)")) errors.push("experiment assignments are not bound into the analysis dataset hash");
if (!analysis.includes("RESEARCH_ANALYSIS_PLAN_MISSING")) errors.push("analysis does not require a locked preregistration plan");
if (!analysis.includes("RESEARCH_ANALYSIS_PLAN_BINDING_MISMATCH")) errors.push("analysis retry does not enforce immutable plan binding");
if (!analysis.includes("RESEARCH_ANALYSIS_WAVE_MISSING")) errors.push("analysis does not fail closed without a wave id");
if (!analysis.includes("study_id,wave_id,label,code_version")) errors.push("analysis run does not persist explicit wave scope");
if (!analysis.includes("WHERE study_id=$1 AND wave_id=$2 AND instrument_id=$3")) errors.push("analysis plan lookup is not wave-scoped");
if (!analysis.includes("WHERE study_id=$1\n      AND wave_id=$2\n      AND fieldwork_phase='main'")) errors.push("analysis sample lookup is not wave-scoped");
if (!analysis.includes("RESEARCH_ANALYSIS_PLAN_CODE_MISMATCH")) errors.push("analysis does not fail closed when preregistered methods diverge from executable code");
if (!analysis.includes('analysisClassification: "prespecified_secondary"')) errors.push("pre-specified secondary estimate classification missing");
if (!analysis.includes('"prespecified_primary"')) errors.push("pre-specified primary estimate classification missing");
if (!analysis.includes("pairwise_independent_strata_difference_v1")) errors.push("pairwise region/sector difference estimator missing");
if (!statistics.includes("benjaminiHochbergAdjustedPValues")) errors.push("pairwise FDR adjustment helper missing");
if (!analysis.includes('adjustedPValueMethod: "benjamini_hochberg"')) errors.push("pairwise FDR-adjusted q-value persistence missing");
if (!methodologyPage.includes("Πριν από την ανάλυση")) errors.push("public methodology does not explain that primary analysis is defined before final results");
if (!methodologyPage.includes("Τα βασικά ερωτήματα ορίζονται πριν δούμε τα τελικά αποτελέσματα.")) errors.push("public methodology does not explain advance analysis planning");
if (!resultsPage.includes("Ανά περιοχή") || !resultsPage.includes("Ανά κλάδο")) errors.push("public results do not expose understandable subgroup results");
if (!methodologyPage.includes("Πρόσθετες αναλύσεις που γίνονται αργότερα παρουσιάζονται ως διερευνητικές")) errors.push("public methodology does not distinguish later additional analyses");
if (!methodologyPage.includes("δεν συγχέονται με τα αρχικά ερευνητικά ερωτήματα")) errors.push("public methodology does not distinguish original questions from later analyses");
if (!resultsPage.includes("Περιορισμοί")) errors.push("public results do not provide an understandable limitations section");
if (!resultsPage.includes("n={estimate.unweightedN.toLocaleString")) errors.push("public results do not disclose sample size alongside results");
if (!resultsPage.includes("95% διάστημα εμπιστοσύνης")) errors.push("public results do not explain confidence intervals in public language");
if (!resultsPage.includes("μεθοδολογία της μελέτης")) errors.push("public results do not link readers to methodology context");
if (!observatoryPage.includes("ολοκληρωμένες απαντήσεις")) errors.push("public observatory does not disclose understandable participation progress");
if (!methodologyPage.includes("Τι θα συνοδεύει τα αποτελέσματα")) errors.push("public methodology does not explain what context accompanies results");
if (!observatoryPage.includes("Πέντε απλά στάδια.")) errors.push("permanent Retail Observatory landing does not explain the study lifecycle in public language");
if (!researchPrivacyPage.includes("Η συμμετοχή στην έρευνα είναι ξεχωριστή από την εμπορική επικοινωνία.")) errors.push("dedicated research privacy boundary is missing");
if (!release.includes("experimentDiagnostics: objectValue(parameters.experimentDiagnostics)")) errors.push("release does not freeze experiment diagnostics");
if (!release.includes("randomizedExperimentExploratoryPublished")) errors.push("release experimental disclosure flag missing");

if (!release.includes("analysisPlan: {")) errors.push("release does not freeze the preregistered analysis plan");
if (!release.includes("analysis_plan_sha256")) errors.push("release does not freeze the analysis-plan fingerprint");
if (!release.includes("prespecifiedAnalysisPlanPublished: true")) errors.push("release disclosure does not identify preregistration");
if (!release.includes("weightDiagnostics: objectValue(parameters.weightDiagnostics)")) errors.push("release does not freeze weighting diagnostics");

if (!analysis.includes("normal95ConfidenceInterval")) errors.push("analysis confidence interval bridge missing");
if (surveyRuntime.includes("generateResearchInvitationBatch")) errors.push("legacy plaintext invitation delivery path remains");
if (surveyRuntime.includes("SURVEY_EXPERIMENT_INCOMPLETE")) errors.push("optional experiment still blocks completion");
if (!surveyRuntime.includes('"eligibilityBasis":"completed_response"')) errors.push("reward eligibility is not completion-based");
if (!surveyRuntime.includes("'reward_delivery','queued'")) errors.push("completion does not queue consent-scoped reward delivery");
if (!surveyRuntime.includes("'results_notification','queued'")) errors.push("publication does not queue results notification");
if (!gemi.includes("export async function* gemiResearchFrameRecords")) errors.push("GEMI governed record stream missing");
if (!release.includes("artifactSha256 = sha256Canonical(artifact)")) errors.push("canonical public release artifact hash missing");
if (!release.includes("getPublishedGreekRetailReleaseArtifact")) errors.push("published release artifact reconstruction missing");
if (!release.includes("researchReleaseArtifactIntegrity")) errors.push("transactional release integrity verifier missing");
if (!surveyRuntime.includes("RESEARCH_RELEASE_ARTIFACT_HASH_MISMATCH")) errors.push("publication does not fail closed on artifact hash mismatch");

if (!release.includes("recomputedSha256 === published.artifactSha256")) errors.push("published release artifact integrity check missing");
if (!release.includes("value instanceof Date")) errors.push("release canonicalizer does not normalize PostgreSQL timestamps");
if (!release.includes("method: text(estimate.method)")) errors.push("published artifact reconstruction drops estimate method");
if (!releaseRoute.includes("X-Konta-Mou-Artifact-SHA256")) errors.push("canonical release endpoint does not expose artifact hash");
if (!releaseRoute.includes("Content-Disposition")) errors.push("canonical release endpoint is not downloadable");

if (!release.includes("RESEARCH_RELEASE_REQUIRES_QA_RESOLUTION")) errors.push("release QA gate missing");
if (!release.includes("confidenceIntervalsPublished")) errors.push("release disclosure contract missing");
if (!release.includes("emailContactabilityRate")) errors.push("release does not freeze frame contactability");
if (!release.includes("questions: instrumentQuestions.rows.map")) errors.push("release does not freeze exact questionnaire");
if (!release.includes("recruitmentTemplates.rows.map")) errors.push("release does not freeze recruitment copy");
if (!release.includes("latestDispositionCounts")) errors.push("release does not freeze final sample dispositions");
if (!release.includes("completionRateOfSent")) errors.push("release does not freeze explicit fieldwork denominators");
if (!release.includes("idempotentReplay")) errors.push("release idempotence contract missing");
if (!jobs.includes("desiredCompleteN") || !jobs.includes("expectedResponseRate")) errors.push("sample planner assumptions are not persisted into sample jobs");
if (!samplingControls.includes("desiredCompleteN: desiredCompletes") || !samplingControls.includes("expectedResponseRate: responseRate")) errors.push("sample planner UI does not submit governed planning assumptions");
if (!samplingControls.includes("planningAssumptionsValid")) errors.push("sample planner UI does not validate planning assumptions");
if (!jobs.includes("kontamou.research.sample-design.v1")) errors.push("sample design evidence document is not frozen by the sample worker");
if (!surveyRuntime.includes("sds.target_complete_n")) errors.push("fieldwork balance does not read frozen sample-design completion targets");
if (!release.includes("sample_design_sha256") || !release.includes("designEvidence")) errors.push("release artifact does not freeze sample design evidence");
if (!surveyRuntime.includes("recordResearchProtocolEvent") || !surveyRuntime.includes("researchProtocolEvents")) errors.push("protocol evidence runtime missing");
if (!release.includes("protocolEvidence") || !release.includes("RESEARCH_RELEASE_PROTOCOL_EVIDENCE_INTEGRITY_FAILED")) errors.push("release artifact does not freeze verified protocol evidence");
if (surveyForm.includes("optionalConsents.marketing")) errors.push("scientific survey completion flow still exposes marketing consent");
if (surveyRuntime.includes('"marketing"')) errors.push("participant research runtime still accepts marketing consent");
if (!surveyForm.includes('href="/join"')) errors.push("commercial follow-up is not separated behind a post-research route");
if (!surveyRuntime.includes("RESEARCH_PILOT_REQUIRES_LOCKED_ANALYSIS_PLAN")) errors.push("pilot lifecycle is not gated by preregistration");
if (!surveyRuntime.includes("RESEARCH_FIELDING_REQUIRES_LOCKED_ANALYSIS_PLAN")) errors.push("fieldwork lifecycle is not gated by preregistration");
if (!surveyRuntime.includes('"publish_release"')) errors.push("explicit publish lifecycle action missing");
if (!schemaRollout.includes("workflow_dispatch")) errors.push("research production schema rollout is not manual-only");
if (/^\s*push:/m.test(schemaRollout)) errors.push("research production schema rollout must not run on push");
if (!schemaRollout.includes("environment: production")) errors.push("research production schema rollout lacks production environment gate");
if (!schemaRollout.includes("if: ${{ inputs.apply }}")) errors.push("research schema mutation lacks explicit apply gate");
if (!schemaRollout.includes("npm run db:migrate")) errors.push("research schema rollout bypasses checksum-aware migrator");
if (!schemaPreflight.includes("expectedSourceVersion = 434")) errors.push("research schema rollout source-head guard missing");
if (!schemaPreflight.includes("expectedCurrentVersion = 415")) errors.push("research schema rollout starting-state guard missing");
if (!schemaPreflight.includes("Refusing a partial-state rollout")) errors.push("research schema partial-state guard missing");
if (!pkg.scripts?.["worker:research"]) errors.push("research worker script missing");

if (errors.length) {
  console.error(["Research survey ecosystem verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  schema: 434,
  tables: created.length + 16,
  migrationSha256: sha,
  suppressionMigrationSha256: suppressionSha,
  deliveryMigrationSha256: deliverySha,
  reminderMigrationSha256: reminderSha,
  analysisPlanMigrationSha256: analysisPlanSha,
  securityHardeningMigrationSha256: securityHardeningSha,
  experimentIntegrityMigrationSha256: experimentIntegritySha,
  phaseIsolationMigrationSha256: phaseIsolationSha,
  sampleDesignMigrationSha256: sampleDesignSha,
  sampleDesignIntegrityMigrationSha256: sampleDesignIntegritySha,
  protocolEvidenceMigrationSha256: protocolEvidenceSha,
  hierarchyMigrationSha256: hierarchySha,
  identityVaultMigrationSha256: identityVaultSha,
  roleSeparationMigrationSha256: roleSeparationSha,
  qualityV3MigrationSha256: qualityV3Sha,
  populationMarginsMigrationSha256: populationMarginsSha,
  longitudinalLineageMigrationSha256: longitudinalLineageSha,
  releaseArchiveMigrationSha256: releaseArchiveSha,
  worker: pkg.scripts?.["worker:research"]
}));

import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export type PublicResearchStudySummary = Readonly<{
  id: string;
  programmeSlug: string;
  programmeTitle: string;
  programmeDescription: string;
  slug: string;
  studyCode: string;
  title: string;
  subtitle?: string;
  populationDefinition: string;
  methodologySummary: string;
  status: string;
  waveId: string;
  waveSlug: string;
  waveCode: string;
  waveTitle: string;
  waveOrdinal: number;
  isCurrentWave: boolean;
  fieldworkStartsAt?: string;
  fieldworkEndsAt?: string;
  selected: number;
  targetCompletes: number;
  invites: number;
  sent: number;
  delivered: number;
  opened: number;
  started: number;
  completed: number;
  completionRate: number;
  responseRate: number;
  releaseVersion?: string;
  releasePublishedAt?: string;
  publicResultsUrl?: string;
  updatedAt?: string;
}>;

export type PublicResearchObservatorySnapshot = Readonly<{
  databaseConfigured: boolean;
  generatedAt: string;
  studies: readonly PublicResearchStudySummary[];
}>;

export type PublicResearchComparison = Readonly<{
  programmeSlug: string;
  studySlug: string;
  variableKey: string;
  variableLabel: string;
  comparabilityPolicy: string;
  baselineWaveSlug: string;
  baselineWaveTitle: string;
  comparisonWaveSlug: string;
  comparisonWaveTitle: string;
  status: string;
  harmonisationStatus?: string;
  harmonisationMethod?: string;
  estimator: string;
}>;

export type PublicResearchPublishedMetric = Readonly<{
  programmeSlug: string;
  studySlug: string;
  studyTitle: string;
  waveSlug: string;
  waveTitle: string;
  releaseVersion: string;
  publishedAt: string;
  metricKey: string;
  estimate: number;
  ciLower?: number;
  ciUpper?: number;
  unweightedN: number;
  weightedN?: number;
  metadata: Record<string, unknown>;
}>;

function emptySnapshot(): PublicResearchObservatorySnapshot {
  return {
    databaseConfigured: false,
    generatedAt: new Date().toISOString(),
    studies: []
  };
}

export async function publicResearchObservatory(): Promise<PublicResearchObservatorySnapshot> {
  if (!productionDatabaseConfigured()) return emptySnapshot();

  try {
    const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT
        p.slug AS programme_slug,
        p.title AS programme_title,
        p.description AS programme_description,
        s.id,
        s.slug,
        s.study_code,
        s.title,
        s.subtitle,
        s.population_definition,
        s.methodology_summary,
        w.id AS wave_id,
        w.slug AS wave_slug,
        w.code AS wave_code,
        w.title AS wave_title,
        w.ordinal AS wave_ordinal,
        w.status AS wave_status,
        w.is_current,
        w.fieldwork_starts_at,
        w.fieldwork_ends_at,
        COALESCE(sample_counts.selected,0)::int AS selected,
        COALESCE(sample_design.desired_complete_n,active_draw.target_n,0)::int AS target_completes,
        COALESCE(invite_counts.invites,0)::int AS invites,
        COALESCE(invite_counts.sent,0)::int AS sent,
        COALESCE(invite_counts.delivered,0)::int AS delivered,
        COALESCE(invite_counts.opened,0)::int AS opened,
        COALESCE(response_counts.started,0)::int AS started,
        COALESCE(response_counts.completed,0)::int AS completed,
        latest_release.release_version,
        latest_release.published_at AS release_published_at,
        COALESCE(latest_release.public_url,s.public_results_url) AS public_results_url,
        GREATEST(
          s.updated_at,
          w.updated_at,
          COALESCE(active_draw.created_at,s.updated_at),
          COALESCE(invite_counts.last_activity_at,s.updated_at),
          COALESCE(response_counts.last_activity_at,s.updated_at),
          COALESCE(latest_release.published_at,s.updated_at)
        ) AS updated_at
      FROM research_studies s
      JOIN research_programmes p ON p.id=s.programme_id
      JOIN research_waves w ON w.study_id=s.id
      LEFT JOIN LATERAL (
        SELECT d.id,d.target_n,d.created_at
        FROM research_sample_draws d
        WHERE d.study_id=s.id
          AND d.wave_id=w.id
          AND d.status IN ('locked','fielded')
        ORDER BY
          CASE
            WHEN w.status IN ('draft','pilot') AND d.fieldwork_phase='pilot' THEN 0
            WHEN w.status NOT IN ('draft','pilot') AND d.fieldwork_phase='main' THEN 0
            ELSE 1
          END,
          d.created_at DESC
        LIMIT 1
      ) active_draw ON true
      LEFT JOIN LATERAL (
        SELECT rsd.desired_complete_n
        FROM research_sample_designs rsd
        WHERE rsd.sample_draw_id=active_draw.id
        ORDER BY rsd.created_at DESC
        LIMIT 1
      ) sample_design ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS selected
        FROM research_sample_units su
        WHERE su.sample_draw_id=active_draw.id
      ) sample_counts ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS invites,
          count(*) FILTER (WHERE ri.sent_at IS NOT NULL)::int AS sent,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM research_invite_events rie
              WHERE rie.invite_id=ri.id AND rie.event_type='delivered'
            )
          )::int AS delivered,
          count(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM research_invite_events rie
              WHERE rie.invite_id=ri.id AND rie.event_type='opened'
            )
          )::int AS opened,
          max(COALESCE(ri.first_opened_at,ri.sent_at,ri.created_at)) AS last_activity_at
        FROM research_invites ri
        JOIN research_sample_units su ON su.id=ri.sample_unit_id
        WHERE su.sample_draw_id=active_draw.id
          AND ri.wave_id=w.id
      ) invite_counts ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS started,
          count(*) FILTER (WHERE rr.status='completed')::int AS completed,
          max(COALESCE(rr.completed_at,rr.started_at)) AS last_activity_at
        FROM research_responses rr
        JOIN research_invites ri ON ri.id=rr.invite_id
        JOIN research_sample_units su ON su.id=ri.sample_unit_id
        WHERE su.sample_draw_id=active_draw.id
          AND rr.wave_id=w.id
      ) response_counts ON true
      LEFT JOIN LATERAL (
        SELECT rs.release_version,rs.published_at,rs.public_url
        FROM research_release_snapshots rs
        WHERE rs.study_id=s.id
          AND rs.wave_id=w.id
          AND rs.published_at IS NOT NULL
        ORDER BY rs.published_at DESC,rs.created_at DESC
        LIMIT 1
      ) latest_release ON true
      WHERE p.status='active'
        AND s.status<>'archived'
        AND w.status<>'archived'
      ORDER BY w.is_current DESC,w.ordinal DESC,s.created_at DESC
    `);

    const studies = rows.rows.map((row): PublicResearchStudySummary => {
      const completed = numberValue(row.completed);
      const targetCompletes = numberValue(row.target_completes);
      const sent = numberValue(row.sent);
      return {
        id: text(row.id),
        programmeSlug: text(row.programme_slug),
        programmeTitle: text(row.programme_title),
        programmeDescription: text(row.programme_description),
        slug: text(row.slug),
        studyCode: text(row.study_code),
        title: text(row.title),
        subtitle: optionalText(row.subtitle),
        populationDefinition: text(row.population_definition),
        methodologySummary: text(row.methodology_summary),
        status: text(row.wave_status),
        waveId: text(row.wave_id),
        waveSlug: text(row.wave_slug),
        waveCode: text(row.wave_code),
        waveTitle: text(row.wave_title),
        waveOrdinal: numberValue(row.wave_ordinal),
        isCurrentWave: Boolean(row.is_current),
        fieldworkStartsAt: isoDate(row.fieldwork_starts_at),
        fieldworkEndsAt: isoDate(row.fieldwork_ends_at),
        selected: numberValue(row.selected),
        targetCompletes,
        invites: numberValue(row.invites),
        sent,
        delivered: numberValue(row.delivered),
        opened: numberValue(row.opened),
        started: numberValue(row.started),
        completed,
        completionRate: targetCompletes > 0 ? Math.min(completed / targetCompletes, 1) : 0,
        responseRate: sent > 0 ? completed / sent : 0,
        releaseVersion: optionalText(row.release_version),
        releasePublishedAt: isoDate(row.release_published_at),
        publicResultsUrl: optionalText(row.public_results_url),
        updatedAt: isoDate(row.updated_at)
      };
    });

    return {
      databaseConfigured: true,
      generatedAt: new Date().toISOString(),
      studies
    };
  } catch {
    // Public research pages must remain available while production schema rollout is pending.
    return emptySnapshot();
  }
}

export async function publicResearchStudy(slug: string): Promise<PublicResearchStudySummary | undefined> {
  const snapshot = await publicResearchObservatory();
  return snapshot.studies.find((study) => study.waveSlug === slug)\n    ?? snapshot.studies.find((study) => study.slug === slug && study.isCurrentWave);
}

export async function publicResearchComparisons(): Promise<readonly PublicResearchComparison[]> {
  if (!productionDatabaseConfigured()) return [];
  try {
    const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT
        p.slug AS programme_slug,
        s.slug AS study_slug,
        vd.variable_key,
        vd.label_el,
        vd.comparability_policy,
        baseline.slug AS baseline_wave_slug,
        baseline.title AS baseline_wave_title,
        comparison.slug AS comparison_wave_slug,
        comparison.title AS comparison_wave_title,
        specs.status,
        hr.comparability_status AS harmonisation_status,
        hr.method AS harmonisation_method,
        specs.estimator
      FROM research_longitudinal_comparison_specs specs
      JOIN research_programmes p ON p.id=specs.programme_id
      JOIN research_studies s ON s.id=specs.study_id
      JOIN research_variable_definitions vd ON vd.id=specs.variable_id
      JOIN research_waves baseline ON baseline.id=specs.baseline_wave_id
      JOIN research_waves comparison ON comparison.id=specs.comparison_wave_id
      LEFT JOIN research_harmonisation_rules hr ON hr.id=specs.harmonisation_rule_id
      WHERE specs.status IN ('locked','published')
      ORDER BY vd.core_longitudinal DESC,vd.label_el,baseline.ordinal,comparison.ordinal
    `);
    return rows.rows.map((row) => ({
      programmeSlug: text(row.programme_slug),
      studySlug: text(row.study_slug),
      variableKey: text(row.variable_key),
      variableLabel: text(row.label_el),
      comparabilityPolicy: text(row.comparability_policy),
      baselineWaveSlug: text(row.baseline_wave_slug),
      baselineWaveTitle: text(row.baseline_wave_title),
      comparisonWaveSlug: text(row.comparison_wave_slug),
      comparisonWaveTitle: text(row.comparison_wave_title),
      status: text(row.status),
      harmonisationStatus: optionalText(row.harmonisation_status),
      harmonisationMethod: optionalText(row.harmonisation_method),
      estimator: text(row.estimator)
    }));
  } catch {
    return [];
  }
}

export async function publicResearchPublishedMetrics(): Promise<readonly PublicResearchPublishedMetric[]> {
  if (!productionDatabaseConfigured()) return [];
  try {
    const rows = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      WITH latest_release AS (
        SELECT DISTINCT ON (rs.wave_id)
          rs.study_id,rs.wave_id,rs.analysis_run_id,rs.release_version,rs.published_at
        FROM research_release_snapshots rs
        WHERE rs.published_at IS NOT NULL
        ORDER BY rs.wave_id,rs.published_at DESC,rs.created_at DESC
      )
      SELECT
        p.slug AS programme_slug,
        s.slug AS study_slug,
        s.title AS study_title,
        w.slug AS wave_slug,
        w.title AS wave_title,
        lr.release_version,
        lr.published_at,
        ae.metric_key,
        ae.estimate,
        ae.ci_lower,
        ae.ci_upper,
        ae.unweighted_n,
        ae.weighted_n,
        ae.metadata
      FROM latest_release lr
      JOIN research_studies s ON s.id=lr.study_id
      JOIN research_programmes p ON p.id=s.programme_id
      JOIN research_waves w ON w.id=lr.wave_id
      JOIN research_analysis_estimates ae ON ae.analysis_run_id=lr.analysis_run_id
      WHERE ae.segment='{}'::jsonb
        AND ae.suppressed=false
        AND ae.estimate IS NOT NULL
      ORDER BY ae.metric_key,w.ordinal
    `);
    return rows.rows.map((row) => ({
      programmeSlug: text(row.programme_slug),
      studySlug: text(row.study_slug),
      studyTitle: text(row.study_title),
      waveSlug: text(row.wave_slug),
      waveTitle: text(row.wave_title),
      releaseVersion: text(row.release_version),
      publishedAt: isoDate(row.published_at) ?? new Date(0).toISOString(),
      metricKey: text(row.metric_key),
      estimate: numberValue(row.estimate),
      ciLower: row.ci_lower == null ? undefined : numberValue(row.ci_lower),
      ciUpper: row.ci_upper == null ? undefined : numberValue(row.ci_upper),
      unweightedN: numberValue(row.unweighted_n),
      weightedN: row.weighted_n == null ? undefined : numberValue(row.weighted_n),
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {}
    }));
  } catch {
    return [];
  }
}

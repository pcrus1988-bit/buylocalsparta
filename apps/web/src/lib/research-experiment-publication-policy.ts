/**
 * Commercial preference experiment EXP01 is INTERNAL ONLY.
 * This module is used by the release builder, integrity verifier and public
 * readers, so adding an estimate/report later cannot silently publish it.
 */
const PRIVATE_EXPERIMENT_MARKER =
  /(?:\bEXP01\b|platform[_ -]?choice[_ -]?experiment|randomized[_ -]?profile|conjoint|experimentDiagnostics|randomizedExperimentExploratoryPublished)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isPrivateExperimentEstimate(row: Record<string, unknown>): boolean {
  return [
    row.metric_key, row.metricKey, row.method,
    isRecord(row.metadata) ? row.metadata.analysisKey : undefined,
    isRecord(row.metadata) ? row.metadata.experimentCode : undefined,
    isRecord(row.metadata) ? row.metadata.label : undefined
  ].some(value => typeof value === "string" && PRIVATE_EXPERIMENT_MARKER.test(value));
}

const ITEM_ID_KEYS = [
  "code","questionCode","analysisKey","metricKey","metric_key","method",
  "experimentCode","family"
] as const;

/**
 * Public artifacts retain normal methodology, but omit:
 *  - the experiment question/configuration and analysis plan entries
 *  - experiment diagnostics, effects and accompanying limitations
 *  - any nested EXP01 items in protocol/metadata JSON.
 *
 * Never mutate internal analysis evidence or the locked plan in the database.
 */
export function redactPrivateExperimentFromPublicMetadata(
  source: Record<string, unknown>
): Record<string, unknown> {
  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      return PRIVATE_EXPERIMENT_MARKER.test(value) ? undefined : value;
    }
    if (Array.isArray(value)) {
      return value.map(walk).filter(item => item !== undefined);
    }
    if (!isRecord(value)) return value;
    if (ITEM_ID_KEYS.some(key =>
      typeof value[key] === "string" && PRIVATE_EXPERIMENT_MARKER.test(value[key] as string)
    )) return undefined;

    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_EXPERIMENT_MARKER.test(key)) continue;
      const cleaned = walk(item);
      if (cleaned !== undefined) safe[key] = cleaned;
    }
    return safe;
  }
  return (walk(source) ?? {}) as Record<string, unknown>;
}

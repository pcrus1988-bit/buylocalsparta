export type OpenIcecatControlSettings = Readonly<{
  indexEnabled: boolean;
  detailEnabled: boolean;
  indexIntervalMs: number;
  indexRetryMs: number;
  indexBatchSize: number;
  indexFetchTimeoutMs: number;
  detailPollMs: number;
  detailSyncIntervalMs: number;
  detailBatchSize: number;
  detailLeaseSeconds: number;
  detailRequestTimeoutMs: number;
  detailRateDelayMs: number;
  detailMaxAttempts: number;
  detailRetryBaseSeconds: number;
  minimumGreekScore: number;
  revision: string;
}>;

export const DEFAULT_OPEN_ICECAT_CONTROL: OpenIcecatControlSettings = Object.freeze({
  indexEnabled: true,
  detailEnabled: true,
  indexIntervalMs: 24 * 60 * 60 * 1000,
  indexRetryMs: 60 * 60 * 1000,
  indexBatchSize: 500,
  indexFetchTimeoutMs: 2 * 60 * 60 * 1000,
  detailPollMs: 2_000,
  detailSyncIntervalMs: 5 * 60 * 1000,
  detailBatchSize: 5,
  detailLeaseSeconds: 300,
  detailRequestTimeoutMs: 15_000,
  detailRateDelayMs: 750,
  detailMaxAttempts: 5,
  detailRetryBaseSeconds: 60,
  minimumGreekScore: 0.9,
  revision: "default"
});

const integerBounds = {
  indexIntervalMs: [60_000, 7 * 24 * 60 * 60 * 1000],
  indexRetryMs: [10_000, 24 * 60 * 60 * 1000],
  indexBatchSize: [1, 10_000],
  indexFetchTimeoutMs: [60_000, 6 * 60 * 60 * 1000],
  detailPollMs: [500, 60_000],
  detailSyncIntervalMs: [10_000, 24 * 60 * 60 * 1000],
  detailBatchSize: [1, 50],
  detailLeaseSeconds: [30, 3_600],
  detailRequestTimeoutMs: [250, 60_000],
  detailRateDelayMs: [0, 60_000],
  detailMaxAttempts: [1, 20],
  detailRetryBaseSeconds: [1, 3_600]
} as const;

type ControlObject = Record<string, unknown>;

function objectValue(value: unknown): ControlObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ControlObject : {};
}

function boundedInteger(value: unknown, fallback: number, bounds: readonly [number, number], field: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < bounds[0] || parsed > bounds[1]) {
    throw new Error(`${field} must be an integer between ${bounds[0]} and ${bounds[1]}`);
  }
  return parsed;
}

function booleanValue(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

function scoreValue(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.9 || parsed > 1) {
    throw new Error("minimumGreekScore must be between 0.9 and 1");
  }
  return parsed;
}

function revisionValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : fallback;
}

export function openIcecatControlFromMetadata(
  metadata: unknown,
  fallback: OpenIcecatControlSettings = DEFAULT_OPEN_ICECAT_CONTROL
): OpenIcecatControlSettings {
  const control = objectValue(objectValue(metadata).icecat_control);
  const parsed: OpenIcecatControlSettings = {
    indexEnabled: booleanValue(control.indexEnabled, fallback.indexEnabled, "indexEnabled"),
    detailEnabled: booleanValue(control.detailEnabled, fallback.detailEnabled, "detailEnabled"),
    indexIntervalMs: boundedInteger(control.indexIntervalMs, fallback.indexIntervalMs, integerBounds.indexIntervalMs, "indexIntervalMs"),
    indexRetryMs: boundedInteger(control.indexRetryMs, fallback.indexRetryMs, integerBounds.indexRetryMs, "indexRetryMs"),
    indexBatchSize: boundedInteger(control.indexBatchSize, fallback.indexBatchSize, integerBounds.indexBatchSize, "indexBatchSize"),
    indexFetchTimeoutMs: boundedInteger(control.indexFetchTimeoutMs, fallback.indexFetchTimeoutMs, integerBounds.indexFetchTimeoutMs, "indexFetchTimeoutMs"),
    detailPollMs: boundedInteger(control.detailPollMs, fallback.detailPollMs, integerBounds.detailPollMs, "detailPollMs"),
    detailSyncIntervalMs: boundedInteger(control.detailSyncIntervalMs, fallback.detailSyncIntervalMs, integerBounds.detailSyncIntervalMs, "detailSyncIntervalMs"),
    detailBatchSize: boundedInteger(control.detailBatchSize, fallback.detailBatchSize, integerBounds.detailBatchSize, "detailBatchSize"),
    detailLeaseSeconds: boundedInteger(control.detailLeaseSeconds, fallback.detailLeaseSeconds, integerBounds.detailLeaseSeconds, "detailLeaseSeconds"),
    detailRequestTimeoutMs: boundedInteger(control.detailRequestTimeoutMs, fallback.detailRequestTimeoutMs, integerBounds.detailRequestTimeoutMs, "detailRequestTimeoutMs"),
    detailRateDelayMs: boundedInteger(control.detailRateDelayMs, fallback.detailRateDelayMs, integerBounds.detailRateDelayMs, "detailRateDelayMs"),
    detailMaxAttempts: boundedInteger(control.detailMaxAttempts, fallback.detailMaxAttempts, integerBounds.detailMaxAttempts, "detailMaxAttempts"),
    detailRetryBaseSeconds: boundedInteger(control.detailRetryBaseSeconds, fallback.detailRetryBaseSeconds, integerBounds.detailRetryBaseSeconds, "detailRetryBaseSeconds"),
    minimumGreekScore: scoreValue(control.minimumGreekScore, fallback.minimumGreekScore),
    revision: revisionValue(control.revision, fallback.revision)
  };

  const minimumLeaseSeconds = Math.ceil(parsed.detailBatchSize * (parsed.detailRequestTimeoutMs + parsed.detailRateDelayMs) / 1000) + 30;
  if (parsed.detailLeaseSeconds < minimumLeaseSeconds) {
    throw new Error(`detailLeaseSeconds must be at least ${minimumLeaseSeconds} for the configured batch/request/rate budget`);
  }
  return parsed;
}

export function openIcecatControlForStorage(input: unknown, revision: string): Record<string, boolean | number | string> {
  const candidate = objectValue(input);
  const parsed = openIcecatControlFromMetadata({ icecat_control: { ...candidate, revision } });
  return { ...parsed, revision };
}

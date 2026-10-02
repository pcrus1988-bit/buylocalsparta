export type SportSizeGuideAudience = "unisex" | "men" | "women" | "kids";

export type SportSizeGuideLabel = Readonly<{
  sizeSystem: string;
  audienceScope: SportSizeGuideAudience;
  sizeLabel: string;
}>;

export type SportSizeGuidePoint = Readonly<{
  measurementMm: number;
  labels: readonly SportSizeGuideLabel[];
}>;

export type SportMeasuredSizeResolution = Readonly<{
  measurementMm: number;
  exact: boolean;
  outOfRange: boolean;
  lowerMeasurementMm?: number;
  upperMeasurementMm?: number;
  sizeLabels: readonly string[];
}>;

function normalizedSystem(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

function labelsFor(
  point: SportSizeGuidePoint,
  sizeSystem: string,
  audience: SportSizeGuideAudience
): readonly string[] {
  const system = normalizedSystem(sizeSystem);
  const direct = point.labels
    .filter((label) => normalizedSystem(label.sizeSystem) === system && label.audienceScope === audience)
    .map((label) => label.sizeLabel.trim())
    .filter(Boolean);
  if (direct.length) return direct;

  return point.labels
    .filter((label) => normalizedSystem(label.sizeSystem) === system && label.audienceScope === "unisex")
    .map((label) => label.sizeLabel.trim())
    .filter(Boolean);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function resolveMeasuredSportSize(
  points: readonly SportSizeGuidePoint[],
  measurementMm: number,
  sizeSystem: string,
  audience: SportSizeGuideAudience
): SportMeasuredSizeResolution {
  if (!Number.isFinite(measurementMm) || measurementMm <= 0) {
    throw new Error("INVALID_FOOT_MEASUREMENT");
  }

  const ordered = [...points]
    .filter((point) => Number.isFinite(point.measurementMm) && point.measurementMm > 0)
    .sort((left, right) => left.measurementMm - right.measurementMm);

  if (!ordered.length) {
    return { measurementMm, exact: false, outOfRange: true, sizeLabels: [] };
  }

  const exact = ordered.find((point) => Math.abs(point.measurementMm - measurementMm) < 0.001);
  if (exact) {
    return {
      measurementMm,
      exact: true,
      outOfRange: false,
      lowerMeasurementMm: exact.measurementMm,
      upperMeasurementMm: exact.measurementMm,
      sizeLabels: unique(labelsFor(exact, sizeSystem, audience))
    };
  }

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  if (measurementMm < first.measurementMm || measurementMm > last.measurementMm) {
    return {
      measurementMm,
      exact: false,
      outOfRange: true,
      lowerMeasurementMm: measurementMm > last.measurementMm ? last.measurementMm : undefined,
      upperMeasurementMm: measurementMm < first.measurementMm ? first.measurementMm : undefined,
      sizeLabels: []
    };
  }

  const upperIndex = ordered.findIndex((point) => point.measurementMm > measurementMm);
  const upper = ordered[upperIndex]!;
  const lower = ordered[upperIndex - 1]!;
  return {
    measurementMm,
    exact: false,
    outOfRange: false,
    lowerMeasurementMm: lower.measurementMm,
    upperMeasurementMm: upper.measurementMm,
    sizeLabels: unique([
      ...labelsFor(lower, sizeSystem, audience),
      ...labelsFor(upper, sizeSystem, audience)
    ])
  };
}

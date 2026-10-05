export type StratifiedObservation = Readonly<{
  stratumId: string;
  value: number;
}>;

export type StratifiedDesignUnit = Readonly<{
  stratumId: string;
  finalWeight: number;
}>;

export type StratifiedVarianceResult = Readonly<{
  standardError?: number;
  variance?: number;
  confidenceLevel?: number;
  reason?: "no_observations" | "item_nonresponse" | "insufficient_stratum_n" | "invalid_design_weight" | "unequal_within_stratum_weights";
}>;

const Z_95 = 1.959963984540054;

export function stratifiedSrsMeanVariance(
  observations: readonly StratifiedObservation[],
  designUnits: readonly StratifiedDesignUnit[]
): StratifiedVarianceResult {
  if (!observations.length || !designUnits.length) return { reason: "no_observations" };

  const designByStratum = new Map<string, number[]>();
  for (const unit of designUnits) {
    if (!unit.stratumId || !Number.isFinite(unit.finalWeight) || unit.finalWeight <= 0) {
      return { reason: "invalid_design_weight" };
    }
    const group = designByStratum.get(unit.stratumId) ?? [];
    group.push(unit.finalWeight);
    designByStratum.set(unit.stratumId, group);
  }

  const valuesByStratum = new Map<string, number[]>();
  for (const observation of observations) {
    if (!observation.stratumId || !Number.isFinite(observation.value)) continue;
    const group = valuesByStratum.get(observation.stratumId) ?? [];
    group.push(observation.value);
    valuesByStratum.set(observation.stratumId, group);
  }

  let totalPopulation = 0;
  for (const weights of designByStratum.values()) {
    totalPopulation += weights.reduce((sum, weight) => sum + weight, 0);
  }
  if (!(totalPopulation > 0)) return { reason: "invalid_design_weight" };

  let variance = 0;
  for (const [stratumId, weights] of designByStratum) {
    const values = valuesByStratum.get(stratumId) ?? [];
    if (values.length !== weights.length) return { reason: "item_nonresponse" };
    if (values.length < 2) return { reason: "insufficient_stratum_n" };

    const firstWeight = weights[0]!;
    const tolerance = Math.max(1e-9, Math.abs(firstWeight) * 1e-9);
    if (weights.some((weight) => Math.abs(weight - firstWeight) > tolerance)) {
      return { reason: "unequal_within_stratum_weights" };
    }

    const population = weights.reduce((sum, weight) => sum + weight, 0);
    const sampleN = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / sampleN;
    const sampleVariance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sampleN - 1);
    const samplingFraction = Math.min(1, sampleN / population);
    const stratumShare = population / totalPopulation;
    variance += (stratumShare ** 2) * (1 - samplingFraction) * sampleVariance / sampleN;
  }

  if (!Number.isFinite(variance) || variance < 0) return { reason: "invalid_design_weight" };
  return {
    variance,
    standardError: Math.sqrt(variance),
    confidenceLevel: 0.95
  };
}

export function normal95ConfidenceInterval(
  estimate: number,
  standardError: number,
  format: "proportion" | "mean"
): Readonly<{ lower: number; upper: number }> {
  const delta = Z_95 * standardError;
  const lower = estimate - delta;
  const upper = estimate + delta;
  return format === "proportion"
    ? { lower: Math.max(0, lower), upper: Math.min(1, upper) }
    : { lower, upper };
}

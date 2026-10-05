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

export type ResearchWeightDiagnostics = Readonly<{
  count: number;
  weightSum: number;
  minWeight: number | null;
  maxWeight: number | null;
  meanWeight: number | null;
  coefficientOfVariation: number | null;
  kishEffectiveN: number | null;
  weightingDesignEffect: number | null;
}>;

export function researchWeightDiagnostics(rawWeights: readonly number[]): ResearchWeightDiagnostics {
  const weights = rawWeights.filter((weight) => Number.isFinite(weight) && weight > 0);
  if (!weights.length) {
    return {
      count: 0,
      weightSum: 0,
      minWeight: null,
      maxWeight: null,
      meanWeight: null,
      coefficientOfVariation: null,
      kishEffectiveN: null,
      weightingDesignEffect: null
    };
  }

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const sumSquares = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const meanWeight = weightSum / weights.length;
  const variance = weights.reduce((sum, weight) => sum + (weight - meanWeight) ** 2, 0) / weights.length;
  const coefficientOfVariation = meanWeight > 0 ? Math.sqrt(variance) / meanWeight : null;
  const kishEffectiveN = sumSquares > 0 ? (weightSum * weightSum) / sumSquares : null;
  const weightingDesignEffect = kishEffectiveN && kishEffectiveN > 0
    ? weights.length / kishEffectiveN
    : null;

  return {
    count: weights.length,
    weightSum,
    minWeight: Math.min(...weights),
    maxWeight: Math.max(...weights),
    meanWeight,
    coefficientOfVariation,
    kishEffectiveN,
    weightingDesignEffect
  };
}

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


export type StratumAllocationInput = Readonly<{ id: string; populationCount: number }>;
export type StratumAllocation = Readonly<{ id: string; populationCount: number; sampleCount: number }>;

export function proportionalStratumAllocation(
  strata: readonly StratumAllocationInput[],
  requestedN: number,
  preferredMinimumPerStratum = 1
): readonly StratumAllocation[] {
  const clean = strata
    .map((stratum) => ({
      id: stratum.id,
      populationCount: Math.max(0, Math.floor(stratum.populationCount))
    }))
    .filter((stratum) => stratum.populationCount > 0);
  const population = clean.reduce((sum, stratum) => sum + stratum.populationCount, 0);
  const target = Math.min(Math.max(0, Math.floor(requestedN)), population);
  if (!target || !clean.length) return clean.map((stratum) => ({ ...stratum, sampleCount: 0 }));

  const minimum = Math.max(0, Math.floor(preferredMinimumPerStratum));
  const preferredFloorTotal = clean.reduce(
    (sum, stratum) => sum + Math.min(minimum, stratum.populationCount),
    0
  );
  const canCoverPreferredFloor = minimum > 0 && target >= preferredFloorTotal;
  const canCoverOnePerStratum = target >= clean.length;
  const base = clean.map((stratum) => ({
    ...stratum,
    sampleCount: canCoverPreferredFloor
      ? Math.min(minimum, stratum.populationCount)
      : canCoverOnePerStratum
        ? 1
        : 0
  }));
  let remaining = target - base.reduce((sum, stratum) => sum + stratum.sampleCount, 0);

  while (remaining > 0) {
    const availablePopulation = base.reduce(
      (sum, stratum) => sum + Math.max(0, stratum.populationCount - stratum.sampleCount),
      0
    );
    if (!availablePopulation) break;

    const quotas = base.map((stratum, index) => {
      const capacity = Math.max(0, stratum.populationCount - stratum.sampleCount);
      const exact = remaining * capacity / availablePopulation;
      return {
        index,
        floor: Math.min(capacity, Math.floor(exact)),
        fraction: exact - Math.floor(exact)
      };
    });

    let added = 0;
    for (const quota of quotas) {
      if (!quota.floor) continue;
      base[quota.index]!.sampleCount += quota.floor;
      added += quota.floor;
    }
    remaining -= added;
    if (remaining <= 0) break;

    const ranked = quotas
      .filter((quota) => base[quota.index]!.sampleCount < base[quota.index]!.populationCount)
      .sort((a, b) => b.fraction - a.fraction || base[a.index]!.id.localeCompare(base[b.index]!.id));
    if (!ranked.length) break;
    for (const quota of ranked) {
      if (remaining <= 0) break;
      const stratum = base[quota.index]!;
      if (stratum.sampleCount >= stratum.populationCount) continue;
      stratum.sampleCount += 1;
      remaining -= 1;
    }
  }

  return base;
}

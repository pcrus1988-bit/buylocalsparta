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


export type ResearchCalibrationUnit = Readonly<{
  id: string;
  initialWeight: number;
  categories: Readonly<Record<string, string>>;
}>;

export type ResearchCalibrationMargin = Readonly<{
  dimension: string;
  category: string;
  target: number;
}>;

export type ResearchCalibrationOptions = Readonly<{
  dimensions: readonly string[];
  maxIterations: number;
  tolerance: number;
  trimMedianRatio?: number | null;
}>;

export type ResearchCalibratedWeight = Readonly<{
  id: string;
  initialWeight: number;
  calibrationWeight: number;
  finalWeight: number;
  rakingAdjustment: number;
  trimAdjustment: number;
  combinedAdjustment: number;
}>;

export type ResearchCalibrationResult = Readonly<{
  weights: readonly ResearchCalibratedWeight[];
  diagnostics: Readonly<{
    dimensions: readonly string[];
    populationTotal: number;
    initialWeightTotal: number;
    preTrimWeightTotal: number;
    finalWeightTotal: number;
    rakingIterations: number;
    postTrimRakingIterations: number;
    maxRelativeMarginError: number;
    preTrimMaxRelativeMarginError: number;
    trimMedianRatio: number | null;
    trimCap: number | null;
    trimmedUnitCount: number;
    preTrim: ResearchWeightDiagnostics;
    final: ResearchWeightDiagnostics;
  }>;
}>;

function researchMedian(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function researchMarginError(
  weights: readonly number[],
  units: readonly ResearchCalibrationUnit[],
  targets: ReadonlyMap<string, ReadonlyMap<string, number>>,
  dimensions: readonly string[]
): number {
  let maximum = 0;
  for (const dimension of dimensions) {
    const dimensionTargets = targets.get(dimension);
    if (!dimensionTargets) continue;
    for (const [category, target] of dimensionTargets) {
      let actual = 0;
      for (let index = 0; index < units.length; index += 1) {
        if (units[index]!.categories[dimension] === category) actual += weights[index]!;
      }
      const denominator = Math.max(1, Math.abs(target));
      maximum = Math.max(maximum, Math.abs(actual - target) / denominator);
    }
  }
  return maximum;
}

function researchRake(
  initialWeights: readonly number[],
  units: readonly ResearchCalibrationUnit[],
  targets: ReadonlyMap<string, ReadonlyMap<string, number>>,
  dimensions: readonly string[],
  maxIterations: number,
  tolerance: number,
  maximumWeight?: number
): Readonly<{ weights: readonly number[]; iterations: number; maxRelativeMarginError: number }> {
  const weights = [...initialWeights];

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    for (const dimension of dimensions) {
      const dimensionTargets = targets.get(dimension);
      if (!dimensionTargets) throw new Error(`RESEARCH_CALIBRATION_MARGIN_DIMENSION_MISSING:${dimension}`);

      for (const [category, target] of [...dimensionTargets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const indexes: number[] = [];
        let current = 0;
        for (let index = 0; index < units.length; index += 1) {
          if (units[index]!.categories[dimension] !== category) continue;
          indexes.push(index);
          current += weights[index]!;
        }

        if (target > 0 && indexes.length === 0) {
          throw new Error(`RESEARCH_CALIBRATION_EMPTY_CELL:${dimension}:${category}`);
        }
        if (target === 0) {
          if (current > tolerance) {
            throw new Error(`RESEARCH_CALIBRATION_ZERO_TARGET_CONFLICT:${dimension}:${category}`);
          }
          continue;
        }
        if (!(current > 0) || !Number.isFinite(current)) {
          throw new Error(`RESEARCH_CALIBRATION_INVALID_CURRENT_TOTAL:${dimension}:${category}`);
        }

        if (maximumWeight !== undefined && target > indexes.length * maximumWeight * (1 + tolerance)) {
          throw new Error(`RESEARCH_CALIBRATION_TRIM_CAP_INFEASIBLE:${dimension}:${category}`);
        }

        const factor = target / current;
        for (const index of indexes) {
          const candidate = weights[index]! * factor;
          weights[index] = maximumWeight === undefined
            ? candidate
            : Math.min(maximumWeight, candidate);
        }
      }
    }

    const maxRelativeMarginError = researchMarginError(weights, units, targets, dimensions);
    if (maxRelativeMarginError <= tolerance) {
      return { weights, iterations: iteration, maxRelativeMarginError };
    }
  }

  const maxRelativeMarginError = researchMarginError(weights, units, targets, dimensions);
  throw new Error(`RESEARCH_CALIBRATION_DID_NOT_CONVERGE:${maxRelativeMarginError}`);
}

/**
 * Iterative proportional fitting (raking) with optional median-ratio trimming.
 *
 * The routine is deliberately fail-closed: every positive population margin
 * must be represented by at least one included response, all requested
 * dimensions must share the same population total, and post-trim bounded
 * raking must converge back to the declared margins.
 */
export function calibrateResearchWeights(
  units: readonly ResearchCalibrationUnit[],
  margins: readonly ResearchCalibrationMargin[],
  options: ResearchCalibrationOptions
): ResearchCalibrationResult {
  if (!units.length) throw new Error("RESEARCH_CALIBRATION_NO_UNITS");
  const dimensions = [...new Set(options.dimensions.map((value) => value.trim()).filter(Boolean))];
  if (!dimensions.length) throw new Error("RESEARCH_CALIBRATION_NO_DIMENSIONS");
  if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1) {
    throw new Error("RESEARCH_CALIBRATION_INVALID_MAX_ITERATIONS");
  }
  if (!(options.tolerance > 0) || !Number.isFinite(options.tolerance)) {
    throw new Error("RESEARCH_CALIBRATION_INVALID_TOLERANCE");
  }
  if (
    options.trimMedianRatio != null &&
    (!(options.trimMedianRatio > 1) || !Number.isFinite(options.trimMedianRatio))
  ) {
    throw new Error("RESEARCH_CALIBRATION_INVALID_TRIM_RATIO");
  }

  const targets = new Map<string, Map<string, number>>();
  for (const dimension of dimensions) targets.set(dimension, new Map());
  for (const margin of margins) {
    if (!targets.has(margin.dimension)) continue;
    const category = margin.category.trim();
    if (!category || !Number.isFinite(margin.target) || margin.target < 0) {
      throw new Error("RESEARCH_CALIBRATION_INVALID_MARGIN");
    }
    const dimensionTargets = targets.get(margin.dimension)!;
    if (dimensionTargets.has(category)) {
      throw new Error(`RESEARCH_CALIBRATION_DUPLICATE_MARGIN:${margin.dimension}:${category}`);
    }
    dimensionTargets.set(category, margin.target);
  }

  const totals = dimensions.map((dimension) => {
    const dimensionTargets = targets.get(dimension)!;
    if (!dimensionTargets.size) {
      throw new Error(`RESEARCH_CALIBRATION_MARGIN_DIMENSION_MISSING:${dimension}`);
    }
    return [...dimensionTargets.values()].reduce((sum, target) => sum + target, 0);
  });
  const populationTotal = totals[0]!;
  if (!(populationTotal > 0)) throw new Error("RESEARCH_CALIBRATION_EMPTY_POPULATION");
  for (const total of totals.slice(1)) {
    if (Math.abs(total - populationTotal) / Math.max(1, populationTotal) > options.tolerance) {
      throw new Error("RESEARCH_CALIBRATION_INCONSISTENT_POPULATION_TOTALS");
    }
  }

  for (const unit of units) {
    if (!unit.id || !(unit.initialWeight > 0) || !Number.isFinite(unit.initialWeight)) {
      throw new Error("RESEARCH_CALIBRATION_INVALID_UNIT");
    }
    for (const dimension of dimensions) {
      const category = unit.categories[dimension]?.trim();
      if (!category || !targets.get(dimension)!.has(category)) {
        throw new Error(`RESEARCH_CALIBRATION_UNIT_OUTSIDE_MARGINS:${dimension}:${category ?? ""}`);
      }
    }
  }

  const initialWeights = units.map((unit) => unit.initialWeight);
  const initialWeightTotal = initialWeights.reduce((sum, weight) => sum + weight, 0);
  const preTrim = researchRake(
    initialWeights,
    units,
    targets,
    dimensions,
    options.maxIterations,
    options.tolerance
  );
  const calibrationWeights = [...preTrim.weights];
  const preTrimWeightTotal = calibrationWeights.reduce((sum, weight) => sum + weight, 0);

  let finalWeights = [...calibrationWeights];
  let trimCap: number | null = null;
  let trimmedUnitCount = 0;
  let postTrimRakingIterations = 0;
  let maxRelativeMarginError = preTrim.maxRelativeMarginError;

  if (options.trimMedianRatio != null) {
    trimCap = researchMedian(calibrationWeights) * options.trimMedianRatio;
    if (!(trimCap > 0) || !Number.isFinite(trimCap)) {
      throw new Error("RESEARCH_CALIBRATION_INVALID_TRIM_CAP");
    }
    trimmedUnitCount = calibrationWeights.filter((weight) => weight > trimCap! + options.tolerance).length;
    if (trimmedUnitCount > 0) {
      const trimmed = calibrationWeights.map((weight) => Math.min(trimCap!, weight));
      const postTrim = researchRake(
        trimmed,
        units,
        targets,
        dimensions,
        options.maxIterations,
        options.tolerance,
        trimCap
      );
      finalWeights = [...postTrim.weights];
      postTrimRakingIterations = postTrim.iterations;
      maxRelativeMarginError = postTrim.maxRelativeMarginError;
    }
  }

  const finalWeightTotal = finalWeights.reduce((sum, weight) => sum + weight, 0);
  return {
    weights: units.map((unit, index) => {
      const calibrationWeight = calibrationWeights[index]!;
      const finalWeight = finalWeights[index]!;
      return {
        id: unit.id,
        initialWeight: unit.initialWeight,
        calibrationWeight,
        finalWeight,
        rakingAdjustment: calibrationWeight / unit.initialWeight,
        trimAdjustment: finalWeight / calibrationWeight,
        combinedAdjustment: finalWeight / unit.initialWeight
      };
    }),
    diagnostics: {
      dimensions,
      populationTotal,
      initialWeightTotal,
      preTrimWeightTotal,
      finalWeightTotal,
      rakingIterations: preTrim.iterations,
      postTrimRakingIterations,
      maxRelativeMarginError,
      preTrimMaxRelativeMarginError: preTrim.maxRelativeMarginError,
      trimMedianRatio: options.trimMedianRatio ?? null,
      trimCap,
      trimmedUnitCount,
      preTrim: researchWeightDiagnostics(calibrationWeights),
      final: researchWeightDiagnostics(finalWeights)
    }
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


function erfApproximation(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

export function normalTwoSidedPValue(zScore: number): number | undefined {
  if (!Number.isFinite(zScore)) return undefined;
  const absolute = Math.abs(zScore);
  const cdf = 0.5 * (1 + erfApproximation(absolute / Math.SQRT2));
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

export function benjaminiHochbergAdjustedPValues(rawPValues: readonly number[]): readonly number[] {
  if (!rawPValues.length) return [];
  const indexed = rawPValues.map((raw, index) => ({
    index,
    p: Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1
  })).sort((a, b) => a.p - b.p || a.index - b.index);

  const adjusted = new Array<number>(indexed.length);
  let runningMinimum = 1;
  for (let rankIndex = indexed.length - 1; rankIndex >= 0; rankIndex -= 1) {
    const item = indexed[rankIndex]!;
    const rank = rankIndex + 1;
    const candidate = Math.min(1, item.p * indexed.length / rank);
    runningMinimum = Math.min(runningMinimum, candidate);
    adjusted[item.index] = runningMinimum;
  }
  return adjusted;
}


export type ClusteredDifferenceObservation = Readonly<{
  clusterId: string;
  group: "level" | "reference";
  value: number;
  weight: number;
}>;

export type ClusteredDifferenceResult = Readonly<{
  difference?: number;
  levelMean?: number;
  referenceMean?: number;
  standardError?: number;
  variance?: number;
  clusterCount: number;
  levelObservationCount: number;
  referenceObservationCount: number;
  levelClusterCount: number;
  referenceClusterCount: number;
  reason?: "no_observations" | "missing_group" | "invalid_weight" | "insufficient_clusters";
}>;

/**
 * Weighted difference in means with respondent-clustered linearization.
 *
 * This is used for the randomized paired-profile experiment where each
 * respondent contributes repeated profile evaluations. The point estimate is
 * the survey-weighted difference in selection probability between one
 * randomized attribute level and its reference level. The sandwich-style
 * variance clusters all repeated tasks/profile sides by respondent so the
 * within-respondent covariance is retained.
 */
export function weightedClusteredDifferenceInMeans(
  observations: readonly ClusteredDifferenceObservation[]
): ClusteredDifferenceResult {
  const clean = observations.filter((observation) =>
    observation.clusterId.trim().length > 0 &&
    Number.isFinite(observation.value) &&
    Number.isFinite(observation.weight) &&
    observation.weight > 0
  );
  if (!clean.length) {
    return {
      clusterCount: 0,
      levelObservationCount: 0,
      referenceObservationCount: 0,
      levelClusterCount: 0,
      referenceClusterCount: 0,
      reason: observations.length ? "invalid_weight" : "no_observations"
    };
  }
  if (clean.length !== observations.length) {
    return {
      clusterCount: new Set(clean.map((observation) => observation.clusterId)).size,
      levelObservationCount: clean.filter((observation) => observation.group === "level").length,
      referenceObservationCount: clean.filter((observation) => observation.group === "reference").length,
      levelClusterCount: new Set(clean.filter((observation) => observation.group === "level").map((observation) => observation.clusterId)).size,
      referenceClusterCount: new Set(clean.filter((observation) => observation.group === "reference").map((observation) => observation.clusterId)).size,
      reason: "invalid_weight"
    };
  }

  const level = clean.filter((observation) => observation.group === "level");
  const reference = clean.filter((observation) => observation.group === "reference");
  const clusterCount = new Set(clean.map((observation) => observation.clusterId)).size;
  const levelClusterCount = new Set(level.map((observation) => observation.clusterId)).size;
  const referenceClusterCount = new Set(reference.map((observation) => observation.clusterId)).size;
  const base = {
    clusterCount,
    levelObservationCount: level.length,
    referenceObservationCount: reference.length,
    levelClusterCount,
    referenceClusterCount
  };

  if (!level.length || !reference.length) return { ...base, reason: "missing_group" };

  const weightedGroupMean = (group: readonly ClusteredDifferenceObservation[]) => {
    const denominator = group.reduce((sum, observation) => sum + observation.weight, 0);
    const numerator = group.reduce((sum, observation) => sum + observation.weight * observation.value, 0);
    return { mean: numerator / denominator, denominator };
  };
  const levelSummary = weightedGroupMean(level);
  const referenceSummary = weightedGroupMean(reference);
  const difference = levelSummary.mean - referenceSummary.mean;

  if (clusterCount < 2) {
    return {
      ...base,
      difference,
      levelMean: levelSummary.mean,
      referenceMean: referenceSummary.mean,
      reason: "insufficient_clusters"
    };
  }

  const influenceByCluster = new Map<string, number>();
  for (const observation of clean) {
    const contribution = observation.group === "level"
      ? observation.weight * (observation.value - levelSummary.mean) / levelSummary.denominator
      : -observation.weight * (observation.value - referenceSummary.mean) / referenceSummary.denominator;
    influenceByCluster.set(
      observation.clusterId,
      (influenceByCluster.get(observation.clusterId) ?? 0) + contribution
    );
  }

  const finiteSampleCorrection = clusterCount / (clusterCount - 1);
  const variance = finiteSampleCorrection * [...influenceByCluster.values()]
    .reduce((sum, influence) => sum + influence * influence, 0);

  return {
    ...base,
    difference,
    levelMean: levelSummary.mean,
    referenceMean: referenceSummary.mean,
    variance,
    standardError: Math.sqrt(Math.max(0, variance))
  };
}


export type ResearchFieldworkDispositionCount = Readonly<{
  dispositionCode: string;
  eligibility: string;
  count: number;
}>;

export type ResearchFieldworkOutcomeSummary = Readonly<{
  definitionVersion: "greek-retail-2026-fieldwork-outcomes-v1";
  selected: number;
  latestDispositionTotal: number;
  ledgerCoverageRate: number | null;
  knownEligible: number;
  knownIneligible: number;
  unknownEligibility: number;
  netSample: number;
  completed: number;
  partial: number;
  refusals: number;
  withdrawn: number;
  noncontact: number;
  bounced: number;
  invalidContact: number;
  unresolved: number;
  sealed: boolean;
  completionRateOfSelected: number | null;
  completionRateOfNetSample: number | null;
  participationRateOfNetSample: number | null;
  explicitDecisionCompletionShare: number | null;
  explicitDecisionRefusalShare: number | null;
  denominatorDefinitions: Readonly<{
    netSample: string;
    completionRateOfNetSample: string;
    participationRateOfNetSample: string;
    explicitDecisionCompletionShare: string;
    explicitDecisionRefusalShare: string;
  }>;
}>;

function finiteNonnegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function nullableRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function researchFieldworkOutcomeSummary(
  selectedRaw: number,
  dispositionCounts: readonly ResearchFieldworkDispositionCount[]
): ResearchFieldworkOutcomeSummary {
  const selected = finiteNonnegativeInteger(selectedRaw);
  const byCode = new Map<string, number>();
  let knownEligible = 0;
  let knownIneligible = 0;
  let unknownEligibility = 0;
  let latestDispositionTotal = 0;

  for (const item of dispositionCounts) {
    const dispositionCode = item.dispositionCode.trim();
    const count = finiteNonnegativeInteger(item.count);
    if (!dispositionCode || count === 0) continue;
    byCode.set(dispositionCode, (byCode.get(dispositionCode) ?? 0) + count);
    latestDispositionTotal += count;
    if (item.eligibility === "eligible") knownEligible += count;
    else if (item.eligibility === "ineligible") knownIneligible += count;
    else unknownEligibility += count;
  }

  const count = (code: string) => byCode.get(code) ?? 0;
  const completed = count("complete");
  const partial = count("partial");
  const refusals = count("refusal");
  const withdrawn = count("withdrawn");
  const noncontact = count("noncontact");
  const bounced = count("bounce");
  const invalidContact = count("invalid_contact");
  const terminalCodes = new Set([
    "complete",
    "partial",
    "refusal",
    "noncontact",
    "bounce",
    "invalid_contact",
    "ineligible",
    "duplicate",
    "out_of_scope",
    "unknown_eligibility",
    "withdrawn"
  ]);
  let unresolved = 0;
  for (const [code, value] of byCode) {
    if (!terminalCodes.has(code)) unresolved += value;
  }

  const netSample = Math.max(0, selected - knownIneligible);
  const participation = completed + partial;
  const explicitDecisions = completed + partial + refusals + withdrawn;

  return {
    definitionVersion: "greek-retail-2026-fieldwork-outcomes-v1",
    selected,
    latestDispositionTotal,
    ledgerCoverageRate: nullableRate(latestDispositionTotal, selected),
    knownEligible,
    knownIneligible,
    unknownEligibility,
    netSample,
    completed,
    partial,
    refusals,
    withdrawn,
    noncontact,
    bounced,
    invalidContact,
    unresolved,
    sealed: latestDispositionTotal === selected && unresolved === 0,
    completionRateOfSelected: nullableRate(completed, selected),
    completionRateOfNetSample: nullableRate(completed, netSample),
    participationRateOfNetSample: nullableRate(participation, netSample),
    explicitDecisionCompletionShare: nullableRate(completed, explicitDecisions),
    explicitDecisionRefusalShare: nullableRate(refusals, explicitDecisions),
    denominatorDefinitions: {
      netSample: "selected minus latest cases known to be ineligible; unknown eligibility remains in the denominator",
      completionRateOfNetSample: "complete / net sample",
      participationRateOfNetSample: "(complete + partial) / net sample",
      explicitDecisionCompletionShare: "complete / (complete + partial + refusal + withdrawn)",
      explicitDecisionRefusalShare: "refusal / (complete + partial + refusal + withdrawn)"
    }
  };
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

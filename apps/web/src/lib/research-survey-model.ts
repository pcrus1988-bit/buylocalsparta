export type ResearchQuestionType = "single" | "multi" | "scale" | "matrix" | "text" | "experiment";

export type ResearchQuestion = Readonly<{
  id: string;
  code: string;
  sectionCode: string;
  position: number;
  type: ResearchQuestionType;
  prompt: string;
  help?: string;
  required: boolean;
  analysisKey: string;
  config: Record<string, unknown>;
}>;

export type ResearchAnswer = string | number | readonly string[] | Record<string, string | number> | null;
export type ResearchAnswerMap = Readonly<Record<string, ResearchAnswer>>;

export type ResearchScore = Readonly<{
  scoringVersion: "greek-retail-2026-v1";
  digitalReadinessScore?: number;
  frictionOverallScore?: number;
  businessConfidenceScore?: number;
  frictionDimensions: Readonly<Record<string, number>>;
}>;

function pairValues(config: Record<string, unknown>, key: string): ReadonlyArray<readonly [string, string]> {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => Array.isArray(item) && item.length >= 2
    ? [[String(item[0]), String(item[1])] as const]
    : []);
}

export function questionOptions(question: ResearchQuestion): ReadonlyArray<readonly [string, string]> {
  return pairValues(question.config, "options");
}

export function matrixItems(question: ResearchQuestion): ReadonlyArray<readonly [string, string]> {
  return pairValues(question.config, "items");
}

export function matrixScale(question: ResearchQuestion): ReadonlyArray<readonly [string, string]> {
  return pairValues(question.config, "scale");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


/**
 * Conditional eligibility is part of the instrument, not just a UI convention.
 * Unknown conditions fail closed. A respondent must never be required to answer
 * a question whose configured routing condition is not met.
 */
export function researchQuestionVisible(question: ResearchQuestion, answers: ResearchAnswerMap): boolean {
  const rule = question.config.showWhen;
  if (rule === undefined) return true;
  if (!isObject(rule) || typeof rule.code !== "string" || !Array.isArray(rule.values)) return false;
  const values = rule.values.map(String);
  if (!values.length) return false;
  const answer = answers[rule.code];
  if (rule.operator === "in") return typeof answer === "string" && values.includes(answer);
  if (rule.operator === "contains_any") return Array.isArray(answer) && answer.some((value) => values.includes(String(value)));
  if (rule.operator === "contains_none") return Array.isArray(answer) && !answer.some((value) => values.includes(String(value)));
  return false;
}

export function answerIsPresent(question: ResearchQuestion, answer: ResearchAnswer | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (typeof answer === "number") return Number.isFinite(answer);
  if (Array.isArray(answer)) return answer.length > 0;
  if (isObject(answer)) {
    if (question.type !== "matrix") return Object.keys(answer).length > 0;
    const items = matrixItems(question).map(([id]) => id);
    return items.every((id) => String(answer[id] ?? "").trim().length > 0);
  }
  return false;
}

export function validateResearchAnswers(
  questions: readonly ResearchQuestion[],
  answers: ResearchAnswerMap
): Readonly<{ ok: boolean; missing: readonly string[]; invalid: readonly string[] }> {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const question of questions) {
    if (question.type === "experiment" || !researchQuestionVisible(question, answers)) continue;
    const answer = answers[question.code];
    if (question.required && !answerIsPresent(question, answer)) {
      missing.push(question.code);
      continue;
    }
    if (!answerIsPresent(question, answer)) continue;

    if (question.type === "single") {
      const allowed = new Set(questionOptions(question).map(([value]) => value));
      if (typeof answer !== "string" || (allowed.size > 0 && !allowed.has(answer))) invalid.push(question.code);
    } else if (question.type === "multi") {
      const allowed = new Set(questionOptions(question).map(([value]) => value));
      const max = Number(question.config.max ?? Number.POSITIVE_INFINITY);
      const normalized = Array.isArray(answer) ? answer.map(String) : [];
      const duplicates = new Set(normalized).size !== normalized.length;
      const noneConflict = allowed.has("none") && normalized.includes("none") && normalized.length > 1;
      if (
        !Array.isArray(answer) ||
        normalized.some((value) => !allowed.has(value)) ||
        normalized.length > max ||
        duplicates ||
        noneConflict
      ) {
        invalid.push(question.code);
      }
    } else if (question.type === "scale") {
      const min = Number(question.config.min);
      const max = Number(question.config.max);
      const numeric = Number(answer);
      if (!Number.isFinite(numeric) || numeric < min || numeric > max) invalid.push(question.code);
    } else if (question.type === "matrix") {
      if (!isObject(answer)) {
        invalid.push(question.code);
        continue;
      }
      const allowed = new Set(matrixScale(question).map(([value]) => value));
      const itemIds = matrixItems(question).map(([value]) => value);
      if (itemIds.some((item) => !allowed.has(String(answer[item] ?? "")))) invalid.push(question.code);
    } else if (question.type === "text") {
      const maxLength = Number(question.config.maxLength ?? 5000);
      if (typeof answer !== "string" || answer.length > maxLength) invalid.push(question.code);
    }
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export type ResearchQualitySignals = Readonly<{
  review: boolean;
  score: number;
  reasonCodes: readonly string[];
  metrics: Readonly<Record<string, unknown>>;
}>;

function matrixStraightlined(answer: ResearchAnswer | undefined, minimumItems = 5): boolean {
  if (!isObject(answer)) return false;
  const values = Object.values(answer)
    .map(String)
    .filter((value) => value && value !== "na");
  return values.length >= minimumItems && new Set(values).size === 1;
}

function suspiciousOpenText(answer: ResearchAnswer | undefined): Readonly<{
  suspicious: boolean;
  reason?: string;
  length: number;
}> {
  if (typeof answer !== "string") return { suspicious: false, length: 0 };
  const value = answer.trim();
  if (!value) return { suspicious: false, length: 0 };
  const normalized = value.toLocaleLowerCase("el-GR").normalize("NFKC");
  const compact = normalized.replace(/\s+/g, "");
  const lettersOrNumbers = normalized.match(/[\p{L}\p{N}]/gu) ?? [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const uniqueTokens = new Set(tokens);
  const mostCommonCharacter = compact.length
    ? Math.max(...[...new Set(compact)].map((character) => compact.split(character).length - 1)) / compact.length
    : 0;

  if (/^(test|testing|asdf+|qwerty+|δοκιμ[ηή])$/iu.test(normalized)) {
    return { suspicious: true, reason: "test_string", length: value.length };
  }
  if (compact.length >= 8 && mostCommonCharacter >= 0.75) {
    return { suspicious: true, reason: "repeated_character", length: value.length };
  }
  if (value.length >= 12 && lettersOrNumbers.length / value.length < 0.25) {
    return { suspicious: true, reason: "low_alphanumeric_share", length: value.length };
  }
  if (tokens.length >= 4 && uniqueTokens.size / tokens.length <= 0.25) {
    return { suspicious: true, reason: "repeated_tokens", length: value.length };
  }
  return { suspicious: false, length: value.length };
}

export function researchQualitySignals(
  answers: ResearchAnswerMap,
  durationSeconds: number
): ResearchQualitySignals {
  const reasonCodes: string[] = [];
  const channels = Array.isArray(answers.Q03) ? answers.Q03.map(String) : [];
  const digitalChannels = ["own_eshop", "marketplace", "social"];
  const hasDeclaredDigitalChannel = channels.some((channel) => digitalChannels.includes(channel));
  const digitalShare = typeof answers.Q04 === "string" ? answers.Q04 : "";
  const positiveDigitalShare = ["1_10", "11_25", "26_50", "51_75", "76_100"].includes(digitalShare);

  if (
    positiveDigitalShare &&
    !hasDeclaredDigitalChannel &&
    !channels.includes("other")
  ) {
    reasonCodes.push("digital_share_channel_mismatch");
  }

  const marketplaceExperience = typeof answers.Q13 === "string" ? answers.Q13 : "";
  if (
    (marketplaceExperience === "current" && !channels.includes("marketplace")) ||
    (marketplaceExperience === "never" && channels.includes("marketplace"))
  ) {
    reasonCodes.push("marketplace_status_mismatch");
  }

  const capabilities = isObject(answers.Q05) ? answers.Q05 : {};
  const stock = String(capabilities.stock ?? "");
  const stockSync = String(capabilities.stock_sync ?? "");
  if (stockSync === "yes" && stock === "no") {
    reasonCodes.push("capability_hierarchy_mismatch");
  }
  const capabilityValues = Object.values(capabilities).map(String).filter(Boolean);
  const allCapabilitiesAbsent = capabilityValues.length >= 5 && capabilityValues.every((value) => value === "no");
  const updateFrequency = typeof answers.Q06 === "string" ? answers.Q06 : "";
  if (allCapabilitiesAbsent && ["realtime", "daily", "few_week", "weekly"].includes(updateFrequency)) {
    reasonCodes.push("digital_system_frequency_mismatch");
  }

  const straightlinedMatrices = ["Q07", "Q14", "Q15"]
    .filter((code) => matrixStraightlined(answers[code]));
  if (straightlinedMatrices.length >= 2) {
    reasonCodes.push("multi_matrix_straightline");
  }

  if (durationSeconds > 0 && durationSeconds < 90) {
    reasonCodes.push("rapid_completion");
  }

  const openText = suspiciousOpenText(answers.Q18);
  if (openText.suspicious) {
    reasonCodes.push("open_text_garbage");
  }

  const penaltyByReason: Readonly<Record<string, number>> = {
    digital_share_channel_mismatch: 15,
    marketplace_status_mismatch: 15,
    capability_hierarchy_mismatch: 20,
    digital_system_frequency_mismatch: 15,
    multi_matrix_straightline: 15,
    rapid_completion: 30,
    open_text_garbage: 20
  };
  const score = Math.max(0, 100 - [...new Set(reasonCodes)]
    .reduce((sum, reason) => sum + (penaltyByReason[reason] ?? 10), 0));

  return {
    review: reasonCodes.length > 0,
    score,
    reasonCodes,
    metrics: {
      durationSeconds,
      declaredDigitalChannels: channels.filter((channel) => digitalChannels.includes(channel)),
      digitalShare,
      marketplaceExperience,
      updateFrequency,
      straightlinedMatrices,
      openTextLength: openText.length,
      openTextSuspicion: openText.reason ?? null
    }
  };
}

function average(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreGreekRetail2026(answers: ResearchAnswerMap): ResearchScore {
  const q05 = isObject(answers.Q05) ? answers.Q05 : {};
  const capabilityValues = Object.values(q05).flatMap((value) => {
    const normalized = String(value);
    if (normalized === "yes") return [1];
    if (normalized === "partial") return [0.5];
    if (normalized === "no") return [0];
    return [];
  });
  const capability = average(capabilityValues);

  const digitalShareMap: Record<string, number> = {
    "0": 0, "1_10": 0.1, "11_25": 0.25, "26_50": 0.5, "51_75": 0.75, "76_100": 1
  };
  const digitalShare = typeof answers.Q04 === "string" ? digitalShareMap[answers.Q04] : undefined;

  const frequencyMap: Record<string, number> = {
    realtime: 1, daily: 0.85, few_week: 0.7, weekly: 0.5, rarely: 0.3, on_demand: 0.15, none: 0
  };
  const frequency = typeof answers.Q06 === "string" ? frequencyMap[answers.Q06] : undefined;

  const channels = Array.isArray(answers.Q03) ? answers.Q03.map(String) : [];
  const digitalChannelCount = ["own_eshop", "marketplace", "social"].filter((value) => channels.includes(value)).length;
  const channelScore = digitalChannelCount / 3;

  const readinessParts: Array<readonly [number | undefined, number]> = [
    [capability, 0.70],
    [digitalShare, 0.15],
    [frequency, 0.10],
    [channelScore, 0.05]
  ];
  const availableWeight = readinessParts.reduce((sum, [value, weight]) => sum + (value === undefined ? 0 : weight), 0);
  const readiness = availableWeight > 0
    ? readinessParts.reduce((sum, [value, weight]) => sum + (value === undefined ? 0 : value * weight), 0) / availableWeight
    : undefined;

  const q07 = isObject(answers.Q07) ? answers.Q07 : {};
  const frictionValue = (key: string): number | undefined => {
    const raw = String(q07[key] ?? "");
    if (!/^[1-5]$/.test(raw)) return undefined;
    return (Number(raw) - 1) / 4 * 100;
  };
  const allFriction = Object.keys(q07).flatMap((key) => {
    const value = frictionValue(key);
    return value === undefined ? [] : [value];
  });
  const dimensionKeys: Record<string, readonly string[]> = {
    catalogue: ["catalog", "content", "stock", "pricing", "tech"],
    growth: ["acquisition", "platform_cost"],
    operations: ["payments", "logistics", "returns", "admin"]
  };
  const frictionDimensions = Object.fromEntries(
    Object.entries(dimensionKeys).flatMap(([dimension, keys]) => {
      const value = average(keys.flatMap((key) => {
        const item = frictionValue(key);
        return item === undefined ? [] : [item];
      }));
      return value === undefined ? [] : [[dimension, round2(value)]];
    })
  );

  const overall = average(allFriction);

  // Preregistered Greek Retail Business Confidence Index (0-100).
  // Complete cases only; 'unknown' is never imputed as neutral.
  const optimismValues: Record<string, number> = {
    very_pessimistic: 0, pessimistic: 25, neutral: 50,
    optimistic: 75, very_optimistic: 100
  };
  const salesValues: Record<string, number> = {
    down_large: 0, down_small: 25, stable: 50, up_small: 75, up_large: 100
  };
  const capacityValues: Record<string, number> = {
    very_unlikely: 0, unlikely: 25, neutral: 50,
    likely: 75, very_likely: 100
  };
  const confidenceParts = [
    typeof answers.Q19 === "string" ? optimismValues[answers.Q19] : undefined,
    typeof answers.Q17 === "string" ? salesValues[answers.Q17] : undefined,
    typeof answers.Q20 === "string" ? capacityValues[answers.Q20] : undefined
  ];
  const businessConfidenceScore = confidenceParts.every((value) => value !== undefined)
    ? round2(confidenceParts.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3)
    : undefined;
  return {
    scoringVersion: "greek-retail-2026-v1",
    digitalReadinessScore: readiness === undefined ? undefined : round2(readiness * 100),
    frictionOverallScore: overall === undefined ? undefined : round2(overall),
    businessConfidenceScore,
    frictionDimensions
  };
}

export function digitalReadinessBand(score: number): string {
  if (score <= 20) return "Mostly Offline";
  if (score <= 40) return "Digitally Visible";
  if (score <= 60) return "Digitally Selling";
  if (score <= 80) return "Omnichannel";
  return "Digitally Integrated";
}

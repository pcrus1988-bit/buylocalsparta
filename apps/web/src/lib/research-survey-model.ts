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
    if (question.type === "experiment") continue;
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
      if (!Array.isArray(answer) || answer.some((value) => !allowed.has(String(value))) || answer.length > max) {
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
  return {
    scoringVersion: "greek-retail-2026-v1",
    digitalReadinessScore: readiness === undefined ? undefined : round2(readiness * 100),
    frictionOverallScore: overall === undefined ? undefined : round2(overall),
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

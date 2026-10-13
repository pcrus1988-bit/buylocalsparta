import { digitalReadinessBand, scoreGreekRetail2026, type ResearchAnswerMap } from "./research-survey-model.ts";

/**
 * Internal DESCRIPTIVE monitoring only. Not the preregistered weighted release
 * analysis. All inputs are one instrument, one fieldwork phase and one response
 * status. Never combine saved drafts with submitted cases.
 */
export type BarometerQuestion = Readonly<{
  code: string;
  prompt: string;
  section: string;
  type: string;
  config: Readonly<Record<string, unknown>>;
}>;

export type BarometerObservation = Readonly<{
  id: string;
  startedAt: string;
  answers: Readonly<Record<string, unknown>>;
}>;

export type BarometerCategory = Readonly<{ key: string; label: string; count: number; percent: number }>;
export type BarometerBreakdown = Readonly<{
  code: string;
  prompt: string;
  section: string;
  type: string;
  base: number;
  categories: readonly BarometerCategory[];
  mean?: number;
  matrix?: readonly Readonly<{
    key: string; label: string; base: number; categories: readonly BarometerCategory[];
  }>[];
  omitted?: string;
}>;
export type BarometerIndicator = Readonly<{
  key: "digital" | "friction" | "confidence";
  label: string;
  average?: number;
  n: number;
  band?: string;
  description: string;
}>;
export type BarometerAggregate = Readonly<{
  respondents: number;
  indicators: readonly BarometerIndicator[];
  questions: readonly BarometerBreakdown[];
  scoringVersion: string;
  minimumBase: number;
}>;

const MIN_DISPLAY_BASE = 5;
const MIN_INDICATOR_BASE = 10;
const percent = (count: number, total: number) => total ? Math.round(count / total * 1000) / 10 : 0;
const avg = (values: readonly number[]): number | undefined =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : undefined;

function pairs(config: Readonly<Record<string, unknown>>, key: string): readonly (readonly [string, string])[] {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => Array.isArray(item) && item.length >= 2
    ? [[String(item[0]), String(item[1])] as const] : []);
}

function categories(choices: readonly (readonly [string, string])[], values: readonly string[], denominator: number): readonly BarometerCategory[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return choices.map(([key, label]) => ({
    key, label, count: counts.get(key) ?? 0, percent: percent(counts.get(key) ?? 0, denominator)
  })).filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "el"));
}

function objectAnswer(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : undefined;
}
function threshold(values: readonly string[], count: number): boolean {
  return values.length ? count >= Math.ceil(values.length * 0.7) : false;
}

/** Avoid computing indices from one partially saved question. */
export function barometerScoreEligible(answers: Readonly<Record<string, unknown>>, questions: readonly BarometerQuestion[]) {
  const q05 = questions.find(q => q.code === "Q05");
  const q07 = questions.find(q => q.code === "Q07");
  const capabilities = objectAnswer(answers.Q05);
  const frictions = objectAnswer(answers.Q07);
  const capabilityKeys = q05 ? pairs(q05.config, "items").map(([id]) => id) : [];
  const frictionKeys = q07 ? pairs(q07.config, "items").map(([id]) => id) : [];
  const capabilityCount = capabilityKeys.filter(k => ["yes", "partial", "no"].includes(String(capabilities?.[k] ?? ""))).length;
  const frictionCount = frictionKeys.filter(k => /^[1-5]$/.test(String(frictions?.[k] ?? ""))).length;
  return {
    digital: Boolean(q05 && Array.isArray(answers.Q03) &&
      typeof answers.Q04 === "string" && typeof answers.Q06 === "string" &&
      threshold(capabilityKeys, capabilityCount)),
    friction: Boolean(q07 && threshold(frictionKeys, frictionCount)),
    confidence: ["Q17", "Q19", "Q20"].every(k => typeof answers[k] === "string")
  };
}

/** No free-text or experiment answer values ever enter distributions. */
export function buildLiveBarometer(
  questions: readonly BarometerQuestion[], observations: readonly BarometerObservation[]
): BarometerAggregate {
  const eligibleQuestions = questions.filter(q => ["single", "multi", "scale", "matrix", "text", "experiment"].includes(q.type));
  const result: BarometerBreakdown[] = [];
  for (const question of eligibleQuestions) {
    const cfg = question.config;
    if (question.type === "text" || question.type === "experiment") {
      result.push({
        code: question.code, prompt: question.prompt, section: question.section,
        type: question.type, base: 0, categories: [],
        omitted: question.type === "text"
          ? "Ανοιχτές απαντήσεις: δεν εμφανίζονται στο συνολικό dashboard για λόγους απορρήτου."
          : "Πειραματική ερώτηση: αξιολογείται μόνο μέσω του εγκεκριμένου πρωτοκόλλου."
      });
      continue;
    }
    if (question.type === "matrix") {
      const items = pairs(cfg, "items");
      const scale = pairs(cfg, "scale");
      const scaleKeys = new Set(scale.map(([key]) => key));
      const matrix = items.map(([key, label]) => {
        const values: string[] = [];
        for (const observation of observations) {
          const obj = objectAnswer(observation.answers[question.code]);
          const value = obj?.[key];
          if (value !== undefined && scaleKeys.has(String(value))) values.push(String(value));
        }
        return { key, label, base: values.length, categories: values.length < MIN_DISPLAY_BASE ? [] : categories(scale, values, values.length) };
      });
      const base = observations.filter(o => {
        const obj = objectAnswer(o.answers[question.code]);
        return obj && items.some(([key]) => scaleKeys.has(String(obj[key] ?? "")));
      }).length;
      result.push({
        code: question.code, prompt: question.prompt, section: question.section,
        type: question.type, base,
        categories: [], matrix: matrix.map(m => ({...m, categories: m.base < MIN_DISPLAY_BASE ? [] : m.categories })),
        omitted: base < MIN_DISPLAY_BASE ? "Πολύ μικρή βάση για απεικόνιση." : undefined
      });
      continue;
    }
    const options = question.type === "scale"
      ? (() => {
          const min = Number(cfg.min ?? 1), max = Number(cfg.max ?? 5), step = Number(cfg.step ?? 1);
          if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)
            || step <= 0 || max < min || (max - min) / step > 20) return [] as (readonly [string, string])[];
          return Array.from({ length: Math.floor((max - min) / step) + 1 },
            (_, i) => [String(min + i * step), String(min + i * step)] as const);
        })()
      : pairs(cfg, "options");
    const allowed = new Set(options.map(([key]) => key));
    const values: string[] = [];
    const numeric: number[] = [];
    let base = 0;
    for (const o of observations) {
      const answer = o.answers[question.code];
      if (question.type === "multi") {
        if (!Array.isArray(answer)) continue;
        const selected = [...new Set(answer.map(String).filter(k => allowed.has(k)))];
        if (!selected.length) continue;
        base++;
        values.push(...selected);
      } else if (question.type === "scale") {
        if (typeof answer !== "number" || !Number.isFinite(answer) || !allowed.has(String(answer))) continue;
        base++;
        values.push(String(answer));
        numeric.push(answer);
      } else {
        if (typeof answer !== "string" || !allowed.has(answer)) continue;
        base++;
        values.push(answer);
      }
    }
    result.push({
      code: question.code, prompt: question.prompt, section: question.section,
      type: question.type, base, categories: base < MIN_DISPLAY_BASE ? [] : categories(options, values, base),
      mean: base >= MIN_DISPLAY_BASE && question.type === "scale" ? avg(numeric) : undefined,
      omitted: base < MIN_DISPLAY_BASE ? "Πολύ μικρή βάση για απεικόνιση." : undefined
    });
  }
  const scores = { digital: [] as number[], friction: [] as number[], confidence: [] as number[] };
  for (const observation of observations) {
    const eligible = barometerScoreEligible(observation.answers, eligibleQuestions);
    if (!eligible.digital && !eligible.friction && !eligible.confidence) continue;
    const scored = scoreGreekRetail2026(observation.answers as ResearchAnswerMap);
    if (eligible.digital && Number.isFinite(scored.digitalReadinessScore)) scores.digital.push(scored.digitalReadinessScore!);
    if (eligible.friction && Number.isFinite(scored.frictionOverallScore)) scores.friction.push(scored.frictionOverallScore!);
    if (eligible.confidence && Number.isFinite(scored.businessConfidenceScore)) scores.confidence.push(scored.businessConfidenceScore!);
  }
  const specs = [
    { key: "digital" as const, label: "Ψηφιακή ωριμότητα", description: "0 = χαμηλή, 100 = υψηλή ψηφιακή ωριμότητα." },
    { key: "friction" as const, label: "Πίεση / εμπόδια", description: "0 = μικρά εμπόδια, 100 = έντονες δυσκολίες." },
    { key: "confidence" as const, label: "Επιχειρηματική εμπιστοσύνη", description: "0 = έντονη απαισιοδοξία, 100 = έντονη αισιοδοξία." }
  ];
  const indicators = specs.map(spec => {
    const values = scores[spec.key];
    const average = values.length >= MIN_INDICATOR_BASE ? avg(values) : undefined;
    return {
      ...spec, n: values.length, average,
      band: spec.key === "digital" && average !== undefined ? digitalReadinessBand(average) : undefined
    };
  });
  return {
    respondents: observations.length, questions: result, indicators,
    scoringVersion: "greek-retail-2026-v1",
    minimumBase: MIN_DISPLAY_BASE
  };
}

import type { ResearchQuestion } from "./research-survey-model";

/**
 * The analysis plan must describe the CURRENT instrument, not a remembered
 * number of questions. This registry mirrors the estimate keys produced by
 * research-survey-analysis.ts; it does not calculate or publish estimates.
 */
export type QuestionEvaluationMeasure = Readonly<{
  questionCode: string;
  sectionCode: string;
  analysisKey: string;
  questionType: ResearchQuestion["type"];
  prompt: string;
  metricKeys: readonly string[];
  classification: "prespecified_secondary" | "qualitative_protocol_required" | "experiment_protocol_required";
  denominator: string;
  missingness: string;
  routing?: unknown;
  interpretation?: string;
}>;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pairs(value: unknown): Array<readonly [string, string]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string"
      ? [[entry[0], String(entry[1])]] as Array<readonly [string, string]>
      : []
  );
}

/** Question-specific scientific interpretation, not unsupported causal claims. */
const INTERPRETATION: Readonly<Record<string, string>> = {
  Q19: "Five-level 12-month optimism distribution; unknown/refusal is not neutral. Also contributes to the separately preregistered confidence index if present.",
  Q20: "Five-level expected investment-financing capacity; unknown/refusal is not neutral. Contributes to the confidence index only under its registered complete-case rule.",
  Q21: "Past-12-month turnover, operating costs and profitability are separate outcomes. Report their joint direction; turnover up with profitability down is an existing prespecified derived measure, not evidence of causation.",
  Q22: "Report each of the four 1–5 agreement items independently; do not collapse opportunity, necessity, unjustified cost and physical-store complementarity into one attitude.",
  Q23: "Report each reported marketplace consequence only for respondents eligible through Q13=current/past. These are self-reported associations, not causal effects.",
  Q24: "Report up to three selected barriers among Q04=0 businesses only; percentages are multiple-response shares and must not be summed to 100%.",
  Q25: "Experienced influence of online presence on physical-store traffic and purchases. No-presence/no-physical-store responses are substantive categories, not successes or failures.",
  Q26: "Hypothetical impact only for respondents with Q25=no_presence; never mix expectations with Q25 experienced effects.",
  Q27: "Top-three reported viability pressures; report each selection percentage with an eligible answered base; totals may exceed 100%."
};

export function questionEvaluationMeasures(questions: readonly ResearchQuestion[]): QuestionEvaluationMeasure[] {
  return [...questions].sort((a, b) => a.position - b.position || a.code.localeCompare(b.code))
    .map((question) => {
      const key = question.analysisKey.trim();
      const config = objectValue(question.config);
      const options = pairs(config.options);
      const items = pairs(config.items);
      const scale = pairs(config.scale);
      const numericMatrix = scale.filter(([option]) => option.trim() !== "" && Number.isFinite(Number(option))).length >= 2;
      let metricKeys: string[] = [];
      let classification: QuestionEvaluationMeasure["classification"] = "prespecified_secondary";
      let missingness = "Report unknown/refusal as configured response categories; do not silently impute missing answers.";

      if (question.type === "single" || question.type === "multi") {
        metricKeys = options.map(([option]) => key + ".share." + option);
        missingness = question.type === "multi"
          ? "Multi-response item shares use eligible respondents with an answered array; totals may exceed 100%."
          : "Each category, including explicit unknown/refusal, is kept separate; absent responses are not assigned a category.";
      } else if (question.type === "scale") {
        metricKeys = [key + ".mean"];
        missingness = "Only finite numeric answers enter the mean; nonnumeric and missing answers are excluded.";
      } else if (question.type === "matrix") {
        metricKeys = items.flatMap(([item]) =>
          numericMatrix ? [key + "." + item + ".mean"]
            : scale.map(([option]) => key + "." + item + ".share." + option)
        );
        missingness = numericMatrix
          ? "Numeric means use valid numeric row answers; missing/unknown row answers are excluded."
          : "Each row has its own denominator; explicit unknown/refusal categories are preserved and missing rows are excluded.";
      } else if (question.type === "text") {
        classification = "qualitative_protocol_required";
        missingness = "Text requires a separately documented coding scheme, reviewer checks and disclosure review; no automatic quantitative estimate is claimed.";
      } else {
        classification = "experiment_protocol_required";
        missingness = "Experiment analysis requires the registered randomisation, allocation and estimand protocol; no generic estimate is invented.";
      }

      return {
        questionCode: question.code,
        sectionCode: question.sectionCode,
        analysisKey: key,
        questionType: question.type,
        prompt: question.prompt,
        metricKeys,
        classification,
        denominator: config.showWhen
          ? "Only respondents eligible under the questionnaire routing condition who answered this question."
          : "Only eligible respondents with a recorded answer for this question.",
        missingness,
        ...(config.showWhen ? { routing: config.showWhen } : {}),
        ...(INTERPRETATION[question.code] ? { interpretation: INTERPRETATION[question.code] } : {})
      };
    });
}

/** Additive, deterministic registry. Does not promote new items to primary outcomes. */
export function planWithCurrentQuestionCoverage(
  originalPlan: Record<string, unknown>,
  questions: readonly ResearchQuestion[],
  instrumentVersion: string,
  instrumentFingerprint: string
): Record<string, unknown> {
  const measures = questionEvaluationMeasures(questions);
  const secondary = objectValue(originalPlan.secondaryAnalyses);
  return {
    ...originalPlan,
    instrumentVersion,
    secondaryAnalyses: {
      ...secondary,
      classification: "prespecified_secondary",
      questionMeasures: measures
    },
    questionnaireCoverage: {
      schema: "kontamou.research.questionnaire-coverage.v1",
      instrumentVersion,
      instrumentFingerprint,
      questionCount: measures.length,
      quantitativeQuestionCount: measures.filter((entry) => entry.metricKeys.length > 0).length,
      generatedMetricCount: measures.reduce((n, entry) => n + entry.metricKeys.length, 0),
      methodology: "Automatic question-level metrics follow research-survey-analysis.ts; headline outcomes and exploratory analyses are unchanged. Each conditional question uses its own eligible answered base. No causal interpretation.",
      subgroupPolicy: "Overall, region, sector and business-size breakdowns only where sampling, effective base, variance and privacy suppression allow; municipality comparisons exploratory only after geography verification.",
      pilotPolicy: "Pilot responses diagnose comprehension/routing and do not become published population estimates."
    }
  };
}

export function questionCoverageIsCurrent(
  plan: Record<string, unknown>,
  questions: readonly ResearchQuestion[],
  instrumentVersion: string,
  instrumentFingerprint: string
): boolean {
  const previous = objectValue(plan.questionnaireCoverage);
  const secondary = objectValue(plan.secondaryAnalyses);
  if (previous.instrumentVersion !== instrumentVersion || previous.instrumentFingerprint !== instrumentFingerprint) return false;
  const actual = secondary.questionMeasures;
  return JSON.stringify(actual) === JSON.stringify(questionEvaluationMeasures(questions));
}

import { MIN_PUBLIC_RELATION_ARM } from "./research-public-chapters.ts";

/**
 * Published relationship measures are SURVEY-WEIGHTED, EXPLORATORY contrasts
 * of two prespecified-in-code groups. They do NOT assert significance or
 * causation. Design-based contrast variance is deliberately withheld because
 * simple independent-observation SEs are not justified for the sample design.
 */
export type ScientificResearchResponse = Readonly<{
  finalWeight: number;
  answers: Readonly<Record<string, unknown>>;
  scores?: Readonly<Record<string, number | undefined>>;
}>;

export type ResearchRelation = Readonly<{
  id: string;
  title: string;
  questionCodes: readonly string[];
  groupALabel: string;
  groupBLabel: string;
  outcomeLabel: string;
  group: (response: ScientificResearchResponse) => "a" | "b" | undefined;
  outcome: (response: ScientificResearchResponse) => boolean | undefined;
}>;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const choice = (response: ScientificResearchResponse, q: string): string =>
  typeof response.answers[q] === "string" ? response.answers[q] as string : "";
const multi = (response: ScientificResearchResponse, q: string): string[] | undefined =>
  Array.isArray(response.answers[q]) ? (response.answers[q] as unknown[]).map(String) : undefined;
const item = (response: ScientificResearchResponse, q: string, field: string): string =>
  String(obj(response.answers[q])[field] ?? "");
const either = (value: string, a: readonly string[], b: readonly string[]): "a" | "b" | undefined =>
  a.includes(value) ? "a" : b.includes(value) ? "b" : undefined;
const boolCategory = (value: string, yes: readonly string[], no: readonly string[]): boolean | undefined =>
  yes.includes(value) ? true : no.includes(value) ? false : undefined;
const range = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : undefined;
};
const q21Known = ["increased","stable","decreased"] as const;
const q19Known = ["very_pessimistic","pessimistic","neutral","optimistic","very_optimistic"] as const;
const q17Known = ["down_large","down_small","stable","up_small","up_large"] as const;
const big = ["5_9","10_19","20_49","50_plus"] as const;

export const RESEARCH_PUBLIC_RELATIONS: readonly ResearchRelation[] = [
  {
    id:"costs-and-profit", title:"Αύξηση λειτουργικού κόστους και πτώση κερδοφορίας",
    questionCodes:["Q21"], groupALabel:"Κόστος αυξήθηκε",
    groupBLabel:"Κόστος σταθερό/μειωμένο", outcomeLabel:"Κερδοφορία μειώθηκε",
    group:r=>either(item(r,"Q21","operating_costs"),["increased"],["stable","decreased"]),
    outcome:r=>boolCategory(item(r,"Q21","profitability"),["decreased"],["stable","increased"])
  },
  {
    id:"size-and-profit", title:"Μέγεθος επιχείρησης και μείωση κερδοφορίας",
    questionCodes:["Q02","Q21"], groupALabel:"1 εργαζόμενος",
    groupBLabel:"5+ εργαζόμενοι", outcomeLabel:"Κερδοφορία μειώθηκε",
    group:r=>either(choice(r,"Q02"),["1"],big),
    outcome:r=>boolCategory(item(r,"Q21","profitability"),["decreased"],["stable","increased"])
  },
  {
    id:"digital-and-growth", title:"Οργανωμένος ψηφιακός κατάλογος και προσδοκία αύξησης πωλήσεων",
    questionCodes:["Q05","Q17"], groupALabel:"Πλήρης ψηφιακός κατάλογος",
    groupBLabel:"Χωρίς ψηφιακό κατάλογο", outcomeLabel:"Προσδοκία αύξησης πωλήσεων",
    group:r=>either(item(r,"Q05","catalog"),["yes"],["no"]),
    outcome:r=>boolCategory(choice(r,"Q17"),["up_small","up_large"],["down_large","down_small","stable"])
  },
  {
    id:"eshop-and-growth", title:"Ιδιόκτητο e-shop και προσδοκία ανάπτυξης",
    questionCodes:["Q03","Q17"], groupALabel:"Διαθέτει e-shop",
    groupBLabel:"Δεν διαθέτει e-shop", outcomeLabel:"Προσδοκία αύξησης πωλήσεων",
    group:r=>{const v=multi(r,"Q03");return v ? v.includes("own_eshop")?"a":"b":undefined;},
    outcome:r=>boolCategory(choice(r,"Q17"),["up_small","up_large"],["down_large","down_small","stable"])
  },
  {
    id:"local-and-discovery", title:"Τοπική πελατεία και σημασία εύρεσης προϊόντων online",
    questionCodes:["Q11","Q12"], groupALabel:"76–100% τοπική πελατεία",
    groupBLabel:"Έως 50% τοπική πελατεία", outcomeLabel:"Υψηλή σημασία online εύρεσης (4–5/5)",
    group:r=>either(choice(r,"Q11"),["76_100"],["0_10","11_25","26_50"]),
    outcome:r=>{const v=range(r.answers.Q12);return v===undefined?undefined:v>=4;}
  },
  {
    id:"online-and-store", title:"Ιδιόκτητο e-shop και αντιλαμβανόμενη ενίσχυση φυσικού καταστήματος",
    questionCodes:["Q03","Q25"], groupALabel:"Διαθέτει e-shop",
    groupBLabel:"Δεν διαθέτει e-shop", outcomeLabel:"Αναφέρει περισσότερες επισκέψεις/αγορές",
    group:r=>{const v=multi(r,"Q03");return v?v.includes("own_eshop")?"a":"b":undefined;},
    outcome:r=>boolCategory(choice(r,"Q25"),["increased_lot","increased_some"],["unchanged","decreased"])
  },
  {
    id:"stock-tools-and-friction", title:"Ψηφιακή διαχείριση αποθέματος και λειτουργική δυσκολία",
    questionCodes:["Q05","Q07"], groupALabel:"Πλήρης ψηφιακή διαχείριση",
    groupBLabel:"Χωρίς ψηφιακή διαχείριση", outcomeLabel:"Υψηλή δυσκολία αποθέματος (4–5/5)",
    group:r=>either(item(r,"Q05","stock"),["yes"],["no"]),
    outcome:r=>{const v=range(obj(r.answers.Q07).stock);return v===undefined?undefined:v>=4;}
  },
  {
    id:"catalog-tools-and-friction", title:"Ψηφιακός κατάλογος και δυσκολία συντήρησης καταλόγου",
    questionCodes:["Q05","Q07"], groupALabel:"Πλήρης ψηφιακός κατάλογος",
    groupBLabel:"Χωρίς ψηφιακό κατάλογο", outcomeLabel:"Υψηλή δυσκολία καταλόγου (4–5/5)",
    group:r=>either(item(r,"Q05","catalog"),["yes"],["no"]),
    outcome:r=>{const v=range(obj(r.answers.Q07).catalog);return v===undefined?undefined:v>=4;}
  },
  {
    id:"finance-and-investment", title:"Χαμηλή δυνατότητα χρηματοδότησης και απουσία επενδυτικών σχεδίων",
    questionCodes:["Q16","Q20"], groupALabel:"Χαμηλή εμπιστοσύνη χρηματοδότησης",
    groupBLabel:"Υψηλή εμπιστοσύνη χρηματοδότησης", outcomeLabel:"Δεν σχεδιάζει σημαντική επένδυση",
    group:r=>either(choice(r,"Q20"),["very_unlikely","unlikely"],["likely","very_likely"]),
    outcome:r=>{const v=multi(r,"Q16");return v? v.includes("none"):undefined;}
  },
  {
    id:"profit-and-optimism", title:"Πτώση κερδοφορίας και επιχειρηματική απαισιοδοξία",
    questionCodes:["Q19","Q21"], groupALabel:"Κερδοφορία μειώθηκε",
    groupBLabel:"Κερδοφορία σταθερή/αυξημένη", outcomeLabel:"Απαισιόδοξος/η για τους επόμενους 12 μήνες",
    group:r=>either(item(r,"Q21","profitability"),["decreased"],["stable","increased"]),
    outcome:r=>boolCategory(choice(r,"Q19"),["very_pessimistic","pessimistic"],["neutral","optimistic","very_optimistic"])
  },
  {
    id:"size-and-optimism", title:"Μέγεθος επιχείρησης και απαισιοδοξία",
    questionCodes:["Q02","Q19"], groupALabel:"1 εργαζόμενος",
    groupBLabel:"5+ εργαζόμενοι", outcomeLabel:"Απαισιόδοξος/η για τους επόμενους 12 μήνες",
    group:r=>either(choice(r,"Q02"),["1"],big),
    outcome:r=>boolCategory(choice(r,"Q19"),["very_pessimistic","pessimistic"],["neutral","optimistic","very_optimistic"])
  }
] as const;

export type ResearchRelationResult = Readonly<{
  id: string;
  difference: number | null;
  suppressed: boolean;
  sampleN: number;
  metadata: Record<string, unknown>;
}>;

export function computeResearchPublicRelations(
  responses: readonly ScientificResearchResponse[]
): ResearchRelationResult[] {
  return RESEARCH_PUBLIC_RELATIONS.map(relation => {
    let sumA = 0, sumB = 0, positiveA = 0, positiveB = 0;
    let nA = 0, nB = 0, successesA = 0, successesB = 0;
    for (const r of responses) {
      if (!Number.isFinite(r.finalWeight) || r.finalWeight <= 0) continue;
      const group = relation.group(r);
      if (!group) continue;
      const result = relation.outcome(r);
      if (result === undefined) continue;
      if (group === "a") {
        nA++; sumA += r.finalWeight;
        if (result) {positiveA += r.finalWeight; successesA++;}
      } else {
        nB++; sumB += r.finalWeight;
        if (result) {positiveB += r.finalWeight; successesB++;}
      }
    }
    const suppressed = nA < MIN_PUBLIC_RELATION_ARM || nB < MIN_PUBLIC_RELATION_ARM || sumA <= 0 || sumB <= 0;
    const a = suppressed ? null : positiveA / sumA;
    const b = suppressed ? null : positiveB / sumB;
    return {
      id: relation.id,
      difference: a !== null && b !== null ? a-b : null,
      suppressed,
      sampleN: nA+nB,
      metadata: {
        label: relation.title,
        relationId: relation.id,
        groupALabel: relation.groupALabel,
        groupBLabel: relation.groupBLabel,
        outcomeLabel: relation.outcomeLabel,
        questionCodes: relation.questionCodes,
        format: "difference",
        interpretation: "descriptive_weighted_percentage_point_difference",
        analysisClassification: "exploratory_not_preregistered",
        preregistered: false,
        confoundingNotAdjusted: true,
        uncertaintyWithheldReason: "design_based_contrast_variance_not_validated",
        minUnweightedNPerGroup: MIN_PUBLIC_RELATION_ARM,
        groupAN: suppressed ? null : nA,
        groupBN: suppressed ? null : nB,
        groupAPositiveN: suppressed ? null : successesA,
        groupBPositiveN: suppressed ? null : successesB,
        groupAShare: a,
        groupBShare: b,
        weightedDenominatorA: suppressed ? null : sumA,
        weightedDenominatorB: suppressed ? null : sumB
      }
    };
  });
}

/**
 * Editorial Q18 display overrides.
 *
 * These rules only affect presentation: original research_answers, QA decisions,
 * overall respondent counts, internal audit history and scientific backups remain intact.
 * Keep the publication/preview/PDF paths on this shared boundary.
 */
const WITHHELD_Q18_ANSWER_IDS = new Set([47198]);

function folded(value: string): string {
  return value.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Return null for a withheld Q18 quote; otherwise return an editorially
 * censored display copy. Never persist the returned value to research_answers.
 *
 * The phrase safeguard also protects pre-approved releases that contain
 * editorial quote identifiers instead of original numeric answer IDs.
 */
export function publicResearchQ18DisplayText(
  answerId: number | string | null | undefined,
  originalText: string
): string | null {
  const id = typeof answerId === "number" ? answerId : String(answerId ?? "");
  if (WITHHELD_Q18_ANSWER_IDS.has(Number(id)) ||
      /(?:^|\D)47198(?:\D|$)/.test(String(id))) return null;
  const normalized = folded(originalText);
  if (normalized.includes("να επαιρνε μαζι του τους εβραιους") ||
      (normalized.includes("υπουργος υγειας") && normalized.includes("εβραιους"))) return null;
  return originalText.replace(/λα[ίι]λαπα/giu, "[λογοκρίθηκε]");
}

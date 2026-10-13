import { validateResearchAnswers, type ResearchAnswerMap, type ResearchQuestion } from "./research-survey-model";

/**
 * These records are evidence of answers saved, not affirmative final submission.
 * Never infer notification or marketing opt-in from any survey answers.
 */
export type ResearchRecoveryCandidate = Readonly<{
  studyId: string;
  waveId: string;
  instrumentId: string;
  responseStatus: string;
  inviteStatus: string;
  suppressionStatus: string;
  fieldworkPhase: string;
  finalQuestionAnsweredAt?: string;
  answers: ResearchAnswerMap;
}>;

export type ResearchRecoveryTotals = Readonly<{
  contentCompleteUnsubmitted: number;
  reachedFinalNeedsCorrection: number;
}>;

/**
 * Only active, main-fieldwork invitations with recorded Q27 answer timestamps
 * qualify for the public recovery progress counters. Excludes suppressed,
 * withdrawn, and incomplete-before-Q27 respondents entirely.
 *
 * No database mutations, participant submissions, or consent changes occur.
 */
export function calculateResearchRecoveryTotals(
  candidates: readonly ResearchRecoveryCandidate[],
  questionsByInstrument: ReadonlyMap<string, readonly ResearchQuestion[]>
): ReadonlyMap<string, ResearchRecoveryTotals> {
  const counts = new Map<string, ResearchRecoveryTotals>();
  for (const candidate of candidates) {
    if (
      candidate.responseStatus !== "in_progress"
      || candidate.inviteStatus !== "started"
      || candidate.suppressionStatus !== "active"
      || candidate.fieldworkPhase !== "main"
      || !candidate.finalQuestionAnsweredAt
    ) continue;
    const questions = questionsByInstrument.get(candidate.instrumentId);
    if (!questions?.some((question) => question.code === "Q27") || candidate.answers.Q27 === undefined) continue;
    const key = candidate.studyId + ":" + candidate.waveId;
    const existing = counts.get(key) ?? { contentCompleteUnsubmitted: 0, reachedFinalNeedsCorrection: 0 };
    const valid = validateResearchAnswers(questions, candidate.answers).ok;
    counts.set(key, {
      contentCompleteUnsubmitted: existing.contentCompleteUnsubmitted + (valid ? 1 : 0),
      reachedFinalNeedsCorrection: existing.reachedFinalNeedsCorrection + (valid ? 0 : 1)
    });
  }
  return counts;
}

export type ReviewedSavingCandidate = {
  confidence:"reviewed_equivalent"|"automatically_verified"|"unverified_match";
  savingsEur:number;
  originalTotalEur:number;
};
export type AlternativeOpportunityLine = {
  lineId:string;
  alternatives:ReviewedSavingCandidate[];
  /** Calculated across all accepted priced candidates before UI truncation. */
  bestCheaperSavingEur?:number;
  cheaperAlternativeCount?:number;
};
export function summarizeCheaperAlternatives(
  results:AlternativeOpportunityLine[]
):{lineIds:string[];productCount:number;potentialSavingEur:number};

export type ReviewedSavingCandidate = {
  confidence:"reviewed_equivalent"|"unverified_match";
  savingsEur:number;
  originalTotalEur:number;
};
export type AlternativeOpportunityLine = {
  lineId:string;
  alternatives:ReviewedSavingCandidate[];
};
export function summarizeCheaperAlternatives(
  results:AlternativeOpportunityLine[]
):{lineIds:string[];productCount:number;potentialSavingEur:number};

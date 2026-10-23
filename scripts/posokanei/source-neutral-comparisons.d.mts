export interface UnifiedCandidateInput {
 id:string;origin:string;name:string;brand?:string|null;storeKey?:string|null;
 priceEur?:number|null;unit?:string|null;quantity?:number|null;
}
export interface UnifiedCandidateResult {
 id:string;origin:string;storeKey:string|null;name:string;brand:string|null;
 priceEur:number|null;matchingEvidence:"approved_group"|"name_overlap";
 confidence:"reviewed_equivalent"|"requires_review";score:number;
 differentBrand:boolean;unit:string|null;quantity:number|null;priceComparisonAvailable:boolean;
}
export function compareSearchTokens(value:string):string[];
export function discoverSourceNeutralCandidates(input:{
 source:UnifiedCandidateInput;candidates:UnifiedCandidateInput[];
 approvedGroups?:Array<{status:string;memberIds:string[]}>;
 limit?:number
}):UnifiedCandidateResult[];

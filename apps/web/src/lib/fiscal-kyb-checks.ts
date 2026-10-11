/** Internal KYB evidence *inventory*: not registry validation, approval or tax certification. */
export const fiscalKybChecks=[
 "business_registration","vat_identity","registered_address","legal_representation",
 "beneficial_ownership","signing_authority","service_agreement"
] as const;
export const fiscalKybSources=[
 "none","gemi_public_registry","aade_public_check",
 "merchant_declaration","signed_agreement","manual_offline_review"
] as const;
export const fiscalKybOutcomes=["requested","evidence_recorded","discrepancy"] as const;
export type FiscalKybCheck=(typeof fiscalKybChecks)[number];
export type FiscalKybSource=(typeof fiscalKybSources)[number];
export type FiscalKybOutcome=(typeof fiscalKybOutcomes)[number];
export type FiscalKybInput=Readonly<{
 organizationId:string;
 checkType:FiscalKybCheck;
 outcome:FiscalKybOutcome;
 sourceKind:FiscalKybSource;
 sourceReference:string|null;
}>;
export class FiscalKybInputError extends Error{
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reference=/^[A-Za-z0-9._:-]{5,160}$/;
export function parseFiscalKybInput(raw:unknown):FiscalKybInput{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new FiscalKybInputError("KYB_INPUT_INVALID");
 const p=raw as Record<string,unknown>;
 if(Object.keys(p).some(k=>!["organizationId","checkType","outcome","sourceKind","sourceReference"].includes(k)))
  throw new FiscalKybInputError("KYB_UNKNOWN_FIELDS");
 if(typeof p.organizationId!=="string"||!uuid.test(p.organizationId)||
   !fiscalKybChecks.includes(p.checkType as FiscalKybCheck)||
   !fiscalKybOutcomes.includes(p.outcome as FiscalKybOutcome)||
   !fiscalKybSources.includes(p.sourceKind as FiscalKybSource))
  throw new FiscalKybInputError("KYB_INPUT_INVALID");
 const source=p.sourceKind as FiscalKybSource;
 const outcome=p.outcome as FiscalKybOutcome;
 if(outcome==="requested"){
  if(source!=="none"||p.sourceReference!==null)
   throw new FiscalKybInputError("KYB_SOURCE_MISMATCH");
 }else{
  if(source==="none"||typeof p.sourceReference!=="string"||!reference.test(p.sourceReference))
   throw new FiscalKybInputError("KYB_SOURCE_MISMATCH");
 }
 // Only allow public registry evidence IDs or internal reference IDs.
 // Never accept narrative, raw ID document numbers, file bytes or untrusted URLs.
 return {organizationId:p.organizationId,
  checkType:p.checkType as FiscalKybCheck,outcome,sourceKind:source,
  sourceReference:outcome==="requested"?null:p.sourceReference as string};
}
export function fiscalKybCounts(events:ReadonlyArray<{check_type:string;outcome:string}>){
 const seen=new Set<string>();
 let recorded=0,discrepancies=0;
 for(const e of events){
  if(seen.has(e.check_type))continue;
  seen.add(e.check_type);
  if(e.outcome==="evidence_recorded")recorded++;
  if(e.outcome==="discrepancy")discrepancies++;
 }
 return {total:fiscalKybChecks.length,recorded,discrepancies,
  outstanding:fiscalKybChecks.length-recorded,legalApproval:false};
}

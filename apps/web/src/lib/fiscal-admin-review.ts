/** Operator-only FISCAL KYB case transitions. This is not a legal approval engine. */
export type FiscalReviewAction="start_review"|"record_follow_up"|"reject";
export type FiscalReviewInput=Readonly<{
 action:FiscalReviewAction;organizationId:string;note?:string;
}>;
export class FiscalReviewInputError extends Error{
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notePattern=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
export function parseFiscalReviewInput(raw:unknown):FiscalReviewInput{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new FiscalReviewInputError("INVALID_REVIEW_REQUEST");
 const value=raw as Record<string,unknown>;
 const fields=Object.keys(value);
 if(fields.some(key=>!["action","organizationId","note"].includes(key)))
  throw new FiscalReviewInputError("REVIEW_UNKNOWN_FIELDS");
 if(!["start_review","record_follow_up","reject"].includes(String(value.action))||
  typeof value.organizationId!=="string"||!uuid.test(value.organizationId))
  throw new FiscalReviewInputError("INVALID_REVIEW_REQUEST");
 const action=value.action as FiscalReviewAction;
 if(action==="start_review"){
  if(fields.includes("note"))throw new FiscalReviewInputError("REVIEW_NOTE_NOT_ALLOWED");
  return {action,organizationId:value.organizationId};
 }
 if(typeof value.note!=="string")throw new FiscalReviewInputError("REVIEW_NOTE_REQUIRED");
 const note=value.note.trim();
 const minimum=action==="reject"?20:10;
 if(note.length<minimum||note.length>1000||notePattern.test(note))
  throw new FiscalReviewInputError("REVIEW_NOTE_INVALID");
 return {action,organizationId:value.organizationId,note};
}
export function fiscalReviewExpectedStatus(action:FiscalReviewAction):"pending_review"|"under_review"{
 return action==="start_review"?"pending_review":"under_review";
}
export function fiscalReviewAuditAction(action:FiscalReviewAction){
 return ({
  start_review:"onboarding.review_started",
  record_follow_up:"onboarding.internal_follow_up_recorded",
  reject:"onboarding.rejected"
 } as const)[action];
}

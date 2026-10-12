/** Strictly bounded inputs; recovery is never proof of legal identity on its own. */
export class FiscalRecoveryInputError extends Error {
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
export const fiscalRecoveryCaseIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const evidencePattern=/^REC-[A-Z0-9-]{8,60}$/;
type RequestInput={action:"request";evidenceRef:string};
type CancelInput={action:"cancel";caseId:string};
type ApproveInput={action:"approve";caseId:string;evidenceRef:string;attested:true};
export type FiscalRecoveryInput=RequestInput|CancelInput|ApproveInput;
export function parseFiscalRecoveryInput(raw:unknown):FiscalRecoveryInput{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new FiscalRecoveryInputError("RECOVERY_INPUT_INVALID");
 const value=raw as Record<string,unknown>;
 const keys=Object.keys(value).sort().join(",");
 if(value.action==="request"&&keys==="action,evidenceRef"&&
   typeof value.evidenceRef==="string"&&evidencePattern.test(value.evidenceRef))
  return {action:"request",evidenceRef:value.evidenceRef};
 if(value.action==="cancel"&&keys==="action,caseId"&&
   typeof value.caseId==="string"&&fiscalRecoveryCaseIdPattern.test(value.caseId))
  return {action:"cancel",caseId:value.caseId.toLowerCase()};
 if(value.action==="approve"&&keys==="action,attested,caseId,evidenceRef"&&
   typeof value.caseId==="string"&&fiscalRecoveryCaseIdPattern.test(value.caseId)&&
   typeof value.evidenceRef==="string"&&evidencePattern.test(value.evidenceRef)&&
   value.attested===true)
  return {action:"approve",caseId:value.caseId.toLowerCase(),evidenceRef:value.evidenceRef,attested:true};
 throw new FiscalRecoveryInputError("RECOVERY_INPUT_INVALID");
}

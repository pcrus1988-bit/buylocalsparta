/**
 * M31 — FISCAL KYB sensitive-document intake security design.
 *
 * This is deliberately a NO-DOCUMENTS, NO-UPLOAD policy. Values that look
 * like successful validations are insufficient to create any upload grant.
 * External evidence, privacy review, audited storage and rollout approvals
 * are not inferred from settings or database state.
 */
import {fiscalKybChecks} from "./fiscal-kyb-checks.ts";
import {evaluateFiscalKybCandidateFile,fiscalKybStorageReadiness} from "./fiscal-kyb-evidence-upload-policy.ts";
import type {FiscalKybStorageGateInputs} from "./fiscal-kyb-evidence-upload-policy.ts";

const requiredControls=Object.freeze([
 {id:"privateBucketVerified",label:"Ιδιωτικό αποθετήριο αρχείων στην ΕΕ",detail:"Ανεξάρτητη επαλήθευση περιοχής φιλοξενίας, δημόσιας απαγόρευσης και πλήρους απομόνωσης αντικειμένων."},
 {id:"tenantPathIsolationVerified",label:"Απομόνωση ανά επιχείρηση",detail:"Έλεγχος εξουσιοδότησης σε κάθε ανάγνωση και εγγραφή, με δοκιμές διασταυρούμενων οργανισμών."},
 {id:"encryptionAtRestVerified",label:"Κρυπτογράφηση και κλειδιά",detail:"Επαληθευμένη κρυπτογράφηση ανά αντικείμενο, διαχείριση κλειδιών και διαδικασία ανάκλησης."},
 {id:"malwareQuarantineVerified",label:"Καραντίνα και ανίχνευση κακόβουλου περιεχομένου",detail:"Υποχρεωτική απομόνωση νέων αρχείων, αναγνώριση πραγματικού τύπου και ανεξάρτητο αποτέλεσμα σάρωσης."},
 {id:"accessAuditVerified",label:"Αμετάβλητο αρχείο πρόσβασης χειριστών",detail:"Έλεγχος καταγραφής αναγνώσεων, διορθώσεων και διαγραφών χωρίς καταγραφή ευαίσθητων περιεχομένων."},
 {id:"retentionDeletionApproved",label:"Διατήρηση και ασφαλής διαγραφή",detail:"Εγκεκριμένες περίοδοι διατήρησης, λήξη, δικαιώματα υποκειμένων και επαληθεύσιμη διαγραφή."},
 {id:"sensitiveDataLegalBasisReviewed",label:"Νομική βάση και ελαχιστοποίηση δεδομένων",detail:"Ανεξάρτητη αξιολόγηση σκοπού, αναγκαιότητας, ενημέρωσης υποκειμένων και περιορισμών επεξεργασίας."},
 {id:"incidentResponseDrillPassed",label:"Διαχείριση περιστατικών",detail:"Δοκιμασμένη αντιμετώπιση διαρροής και ανάκληση πρόσβασης, με καθορισμένη ευθύνη ειδοποιήσεων."},
 {id:"operatorMfaReviewed",label:"Έλεγχος MFA χειριστών",detail:"Τεκμηριωμένος έλεγχος υποχρεωτικού MFA, απομακρύνσεων πρόσβασης και ασφαλούς ανάκτησης λογαριασμού."}
] as const satisfies readonly {id:keyof FiscalKybStorageGateInputs;label:string;detail:string}[]);

type GateId=(typeof requiredControls)[number]["id"];
export type FiscalKybIntakeControl=Readonly<{
 id:GateId;label:string;detail:string;state:"not_independently_verified";
}>;
export type FiscalKybIntakeReadiness=Readonly<{
 controls:readonly FiscalKybIntakeControl[];
 unverifiedCount:number;
 operatorMfaEnforced:boolean;
 dangerousUploadFlagDetected:boolean;
 technicalClaimsIndependentlyVerified:false;
 independentLegalApproval:false;
 evidenceStorageProvisioned:false;
 canRequestUploadGrant:false;
 acceptingUploads:false;
 acceptingDocumentBytes:false;
 canOpenQuarantinedEvidence:false;
 legalFiscalIssuanceEnabled:false;
 status:"not_ready";
}>;

const noEvidence=Object.freeze(Object.fromEntries(
 requiredControls.map(control=>[control.id,false])
) as unknown as FiscalKybStorageGateInputs);

/**
 * No runtime signal can flip a gate to verified; that requires a separate
 * trustworthy approval/evidence system, which does not exist in M31.
 */
export function getFiscalKybIntakeReadiness(runtime:Readonly<{
 operatorMfaEnforced:boolean;dangerousUploadFlagDetected:boolean;
}>):FiscalKybIntakeReadiness{
 if(!runtime||typeof runtime!=="object"||
    Object.keys(runtime).sort().join(",")!=="dangerousUploadFlagDetected,operatorMfaEnforced"||
    typeof runtime.operatorMfaEnforced!=="boolean"||
    typeof runtime.dangerousUploadFlagDetected!=="boolean")
  throw new Error("FISCAL_INTAKE_RUNTIME_INVALID");
 const storage=fiscalKybStorageReadiness(noEvidence);
 if(storage.acceptingUploads)throw new Error("FISCAL_INTAKE_UNSAFE");
 const controls=Object.freeze(requiredControls.map(control=>Object.freeze({
  ...control,state:"not_independently_verified" as const
 })));
 return Object.freeze({
  controls,unverifiedCount:controls.length,
  operatorMfaEnforced:runtime.operatorMfaEnforced,
  dangerousUploadFlagDetected:runtime.dangerousUploadFlagDetected,
  technicalClaimsIndependentlyVerified:false as const,
  independentLegalApproval:false as const,
  evidenceStorageProvisioned:false as const,
  canRequestUploadGrant:false as const,
  acceptingUploads:false as const,
  acceptingDocumentBytes:false as const,
  canOpenQuarantinedEvidence:false as const,
  legalFiscalIssuanceEnabled:false as const,
  status:"not_ready" as const
 });
}

/**
 * Future merchant-side authorization/metadata boundary, evaluated against
 * SERVER-DERIVED account membership only. This neither receives bytes nor
 * signs requests, generates presigned URLs, or writes database rows.
 */
export type FiscalKybIntakeCandidate=Readonly<{
 selectedOrganizationId:string;
 sessionOrganizationId:string;
 membershipRole:"owner"|"accountant"|"viewer";
 organizationStatus:"pending_review"|"under_review"|"approved"|"rejected"|"suspended";
 checkType:string;
 metadata:unknown;
}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assessFiscalKybIntakeCandidate(raw:unknown){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new Error("FISCAL_INTAKE_CANDIDATE_INVALID");
 const x=raw as Record<string,unknown>;
 const allowed=["selectedOrganizationId","sessionOrganizationId","membershipRole",
   "organizationStatus","checkType","metadata"];
 if(Object.keys(x).sort().join(",")!==allowed.sort().join(","))
  throw new Error("FISCAL_INTAKE_CANDIDATE_INVALID");
 const tenantIsValid=
  typeof x.selectedOrganizationId==="string"&&uuid.test(x.selectedOrganizationId)&&
  typeof x.sessionOrganizationId==="string"&&uuid.test(x.sessionOrganizationId)&&
  x.selectedOrganizationId.toLowerCase()===x.sessionOrganizationId.toLowerCase();
 const roleIsValid=x.membershipRole==="owner"||x.membershipRole==="accountant";
 const orgIsActive=x.organizationStatus==="pending_review"||
  x.organizationStatus==="under_review"||x.organizationStatus==="approved";
 const recognizedCheck=typeof x.checkType==="string"&&
  fiscalKybChecks.some(id=>id===x.checkType);
 const metadata=evaluateFiscalKybCandidateFile(x.metadata);
 return Object.freeze({
  tenantIsValid,roleIsValid,orgIsActive,recognizedCheck,
  metadataFormatAccepted:metadata.metadataAccepted,
  eligibleForFuturePolicyAssessment:tenantIsValid&&roleIsValid&&orgIsActive&&
   recognizedCheck&&metadata.metadataAccepted,
  requiresIndependentScanning:true as const,
  signedUploadAuthorizationIssued:false as const,
  mayUpload:false as const,mayPersist:false as const,
  evidenceApproved:false as const,legalFiscalIssuanceEnabled:false as const
 });
}

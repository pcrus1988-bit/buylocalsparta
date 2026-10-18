/**
 * M27: privacy-minimized merchant-facing KYB progress.
 * This is an inventory of operator-recorded checklist events, NOT a registry
 * verification, identity decision, approval, or statutory issuance permission.
 * Never pass sources, evidence references, reviewer identity or notes here.
 */
import {fiscalKybChecks} from "./fiscal-kyb-checks.ts";
import type {FiscalKybCheck} from "./fiscal-kyb-checks.ts";

export type FiscalMerchantKybStage=
 "not_recorded"|"requested"|"evidence_recorded"|"discrepancy"|"needs_review";

export type FiscalMerchantKybRow=Readonly<{
  checkType:FiscalKybCheck;
  label:string;
  stage:FiscalMerchantKybStage;
  stageLabel:string;
  description:string;
}>;

export type FiscalMerchantKybProgress=Readonly<{
  rows:readonly FiscalMerchantKybRow[];
  recordedCount:number;
  outstandingCount:number;
  followUpCount:number;
  legalApproval:false;
  identityVerified:false;
  fiscalIssuanceEnabled:false;
}>;

type StatusInput=Readonly<{check_type:string|null;outcome:string|null}>;

const LABELS:Readonly<Record<FiscalKybCheck,string>>={
 business_registration:"Εγγραφή επιχείρησης",
 vat_identity:"Στοιχεία ΑΦΜ",
 registered_address:"Επαγγελματική έδρα",
 legal_representation:"Νόμιμη εκπροσώπηση",
 beneficial_ownership:"Πραγματικοί δικαιούχοι",
 signing_authority:"Εξουσιοδότηση υπογραφής",
 service_agreement:"Σύμβαση υπηρεσιών"
};

const MESSAGES:Readonly<Record<FiscalMerchantKybStage,Readonly<{
 label:string;description:string;
}>>>={
 not_recorded:{label:"Δεν έχει καταχωριστεί",description:"Δεν υπάρχει εσωτερική καταχώριση για το συγκεκριμένο βήμα."},
 requested:{label:"Εκκρεμεί τεκμηρίωση",description:"Ο χειριστής έχει σημειώσει ότι απαιτείται περαιτέρω τεκμηρίωση. Δεν αποστέλλονται αυτόματα αιτήματα."},
 evidence_recorded:{label:"Στοιχείο καταχωρίστηκε",description:"Έχει καταχωριστεί αναφορά σε στοιχείο προς έλεγχο. Δεν σημαίνει ότι επιβεβαιώθηκε ή εγκρίθηκε."},
 discrepancy:{label:"Απαιτείται επανεξέταση",description:"Ο χειριστής κατέγραψε εκκρεμότητα που χρειάζεται ανεξάρτητη εξέταση. Δεν αποκαλύπτονται εσωτερικές σημειώσεις ή έγγραφα."},
 needs_review:{label:"Απαιτείται επανέλεγχος",description:"Η κατάσταση δεν αναγνωρίστηκε με ασφάλεια και δεν προσμετράται ως καταχωρισμένο στοιχείο."}
};

export function summarizeFiscalMerchantKybProgress(
 events:readonly StatusInput[]
):FiscalMerchantKybProgress{
 if(!Array.isArray(events)||events.length>100)
  throw new Error("FISCAL_KYB_SUMMARY_INVALID");
 const allowed=new Set<string>(fiscalKybChecks);
 const latest=new Map<FiscalKybCheck,FiscalMerchantKybStage>();
 // Source is ordered by the DB (latest first). Never let an older event
 // override a later discrepancy or request.
 for(const event of events){
   if(!event||typeof event!=="object"||typeof event.check_type!=="string"||
      !allowed.has(event.check_type)||latest.has(event.check_type as FiscalKybCheck))
      continue;
   const stage:FiscalMerchantKybStage=
     event.outcome==="requested"||event.outcome==="evidence_recorded"||
     event.outcome==="discrepancy" ? event.outcome : "needs_review";
   latest.set(event.check_type as FiscalKybCheck,stage);
 }
 let recordedCount=0;
 let followUpCount=0;
 const rows=fiscalKybChecks.map(checkType=>{
   const stage=latest.get(checkType)??"not_recorded";
   if(stage==="evidence_recorded")recordedCount++;
   if(stage==="discrepancy"||stage==="needs_review")followUpCount++;
   return Object.freeze({
     checkType,label:LABELS[checkType],stage,
     stageLabel:MESSAGES[stage].label,
     description:MESSAGES[stage].description
   });
 });
 return Object.freeze({
   rows:Object.freeze(rows),
   recordedCount,
   outstandingCount:fiscalKybChecks.length-recordedCount,
   followUpCount,
   legalApproval:false,
   identityVerified:false,
   fiscalIssuanceEnabled:false
 });
}

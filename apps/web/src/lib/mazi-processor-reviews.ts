import type {SessionPrincipal} from "@buy-local-sparta/core";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {getAdminPostgresRuntime} from "./postgres-runtime";

/** Mandatory review categories represent data-flow functions, NOT an assertion that
 * a named vendor is actively processing data. External contracts require real inspection. */
export const MAZI_PROCESSOR_DOMAINS=[
 {key:"hosting_runtime",title:"Hosting και runtime",required:true,examples:"Vercel και πραγματικά deployment logs, edge, CDN, monitoring"},
 {key:"database_auth_storage",title:"Βάσεις δεδομένων, Auth και Storage",required:true,examples:"Supabase, Auth, database, backups, storage, administrative access"},
 {key:"transactional_email",title:"Email ταυτοποίησης και εξυπηρέτησης",required:true,examples:"Resend, SMTP, πραγματικός πάροχος παράδοσης και email logs"},
 {key:"observability_analytics",title:"Monitoring, telemetry και analytics",required:false,examples:"Όποιοι πραγματικοί πάροχοι, pixels, log forwarders, εργαλεία σφαλμάτων"},
 {key:"payment_financial",title:"Πληρωμές, οικονομικά και λογιστικά",required:false,examples:"Πάροχοι PSP, τιμολόγησης ή λογιστικής όταν ενεργοποιηθούν"},
 {key:"third_party_integrations",title:"Εξωτερικές διασυνδέσεις και υπηρεσίες",required:false,examples:"GEMI/KYB, τρίτα APIs, integrations, χρήση επαφών ή social media"},
 {key:"backups_exports",title:"Backup, exports και αρχεία τρίτων",required:false,examples:"S3, Drive, ιδιωτικά exports, περιοχές καταστροφής και αποκατάστασης"}
] as const;
export type MaziProcessorDomain=(typeof MAZI_PROCESSOR_DOMAINS)[number]["key"];
export const MAZI_PROCESSOR_CHECKS=[
 {id:"processing_scope_and_role",label:"Εντόπισα πραγματικά συστήματα, κατηγορίες δεδομένων, σκοπούς και ρόλο εκτελούντος/υπευθύνου."},
 {id:"binding_agreement",label:"Έλεγξα πραγματικά ισχύουσα σύμβαση/νομική πράξη και τα ουσιώδη στοιχεία του άρθρου 28 όταν εφαρμόζεται."},
 {id:"instructions_and_confidentiality",label:"Έλεγξα τεκμηριωμένες εντολές, εμπιστευτικότητα και επιτρεπόμενη πρόσβαση."},
 {id:"security_and_assistance",label:"Έλεγξα άρθρα 32–34, συνδρομή DSAR, ειδοποίηση περιστατικών, ελέγχους και αποδεικτικά."},
 {id:"subprocessors_and_changes",label:"Έλεγξα όλους τους ισχύοντες υποεκτελούντες, εξουσιοδότηση, αλλαγές και δικαίωμα αντίρρησης."},
 {id:"locations_and_transfers",label:"Χαρτογράφησα πραγματικές χώρες/πρόσβαση και εφαρμοστέα νομική βάση μεταφορών (άρθρα 44–49)."},
 {id:"return_deletion_backups",label:"Έλεγξα επιστροφή/διαγραφή, συμβατικά backups, περιόδους και όρια πραγματικής εκκαθάρισης."},
 {id:"controller_counsel_review",label:"Διαθέτω πραγματική τεκμηρίωση ελέγχου από υπεύθυνο επεξεργασίας και αρμόδιο νομικό σύμβουλο."}
] as const;
export const MAZI_PROCESSOR_ROLES=[
 "processor","independent_controller","joint_controller","no_personal_data","pending"
] as const;
export const MAZI_TRANSFER_MECHANISMS=[
 "eea_only_verified","adequacy_verified","scc_tia_verified","exception_reviewed","not_applicable","not_assessed"
] as const;
type Review={
 id:string;domain_key:MaziProcessorDomain;
 review_state:"evidence_recorded"|"reopened";usage_state:"in_use"|"not_used";
 processing_role:string;transfer_mechanism:string;reviewed_on:string;
 review_checks:string[];agreement_reference:string|null;evidence_reference:string;
 findings:string;recorded_at:Date
};
const pool=()=>getAdminPostgresRuntime().nativePool;
const ev=(s:string)=>s.length>=12&&s.length<=180&&/^[A-Za-z0-9_./:#-]+$/.test(s);
const today=()=>new Intl.DateTimeFormat("sv-SE",{
 timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());
export type ReviewInput={
 domainKey:string;state:string;usage:string;role:string;transfer:string;
 reviewedOn:string;checks:readonly string[];agreement:string;reference:string;findings:string
};
export function validateMaziProcessorReview(input:ReviewInput):boolean{
 const domain=MAZI_PROCESSOR_DOMAINS.find(d=>d.key===input.domainKey);
 if(!domain||!["evidence_recorded","reopened"].includes(input.state))return false;
 if(!ev(input.reference)||input.findings.trim().length<60||input.findings.trim().length>700)return false;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.reviewedOn)||input.reviewedOn>today())return false;
 const d=new Date(input.reviewedOn+"T00:00:00.000Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==input.reviewedOn)return false;
 if(!["in_use","not_used"].includes(input.usage))return false;
 if(!(MAZI_PROCESSOR_ROLES as readonly string[]).includes(input.role))return false;
 if(!(MAZI_TRANSFER_MECHANISMS as readonly string[]).includes(input.transfer))return false;
 if(input.state==="reopened")return true;
 // The connected MAZI Supabase production project was verified in us-east-1 (2026-10-29).
 // Reject an EEA-only database/Auth/Storage claim until a region migration is verified.
 if(input.domainKey==="database_auth_storage"&&input.transfer==="eea_only_verified")return false;
 if(input.usage==="not_used")return !domain.required&&
  input.role==="no_personal_data"&&input.transfer==="not_applicable"&&
  input.checks.length===1&&input.checks[0]==="not_used_verified"&&!input.agreement;
 if(input.role==="pending"||input.role==="no_personal_data"||(input.transfer==="not_assessed"||input.transfer==="not_applicable")||
  !ev(input.agreement))return false;
 const expected=new Set<string>(MAZI_PROCESSOR_CHECKS.map(x=>x.id));
 const actual=new Set(input.checks);
 return input.checks.length===expected.size&&actual.size===expected.size&&
  [...actual].every(key=>expected.has(key));
}
export async function readMaziProcessorReviews(principal:SessionPrincipal):Promise<{
 latest:Review[];history:Review[]
}>{
 await marketplaceMaziActor(principal);
 const [a,b]=await Promise.all([
  pool().query<Review>(`SELECT DISTINCT ON (domain_key)
    id::text,domain_key,review_state,usage_state,processing_role,transfer_mechanism,
    reviewed_on::text,review_checks,agreement_reference,evidence_reference,findings,recorded_at
    FROM public.mazi_processor_reviews ORDER BY domain_key,recorded_at DESC,id DESC`),
  pool().query<Review>(`SELECT id::text,domain_key,review_state,usage_state,
   processing_role,transfer_mechanism,reviewed_on::text,review_checks,
   agreement_reference,evidence_reference,findings,recorded_at
   FROM public.mazi_processor_reviews ORDER BY recorded_at DESC,id DESC LIMIT 40`)
 ]);
 return {latest:a.rows,history:b.rows};
}
export async function maziProcessorReviewsComplete(principal:SessionPrincipal):Promise<boolean>{
 const {latest}=await readMaziProcessorReviews(principal);
 return MAZI_PROCESSOR_DOMAINS.every(c=>latest.some(r=>
  r.domain_key===c.key&&r.review_state==="evidence_recorded"&&
  (!c.required||r.usage_state==="in_use")));
}
export async function recordMaziProcessorReview(principal:SessionPrincipal,input:ReviewInput):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!validateMaziProcessorReview(input))throw Error("MAZI_PROCESSOR_REVIEW_INVALID");
 const query=`INSERT INTO public.mazi_processor_reviews
  (domain_key,review_state,usage_state,processing_role,transfer_mechanism,
   reviewed_on,review_checks,agreement_reference,evidence_reference,findings,actor_user_id)
  VALUES ($1,$2,$3,$4,$5,$6::date,$7::text[],$8,$9,$10,$11::uuid) RETURNING id`;
 const checks=input.state==="reopened"?[]:input.checks;
 const args=[input.domainKey,input.state,input.usage,input.role,input.transfer,
  input.reviewedOn,checks,input.agreement||null,input.reference,input.findings.trim(),actor];
 const r=await pool().query(query,args);
 if(r.rowCount!==1)throw Error("MAZI_PROCESSOR_REVIEW_NOT_SAVED");
}

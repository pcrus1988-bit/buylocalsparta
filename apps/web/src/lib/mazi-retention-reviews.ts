import type {SessionPrincipal} from "@buy-local-sparta/core";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {getAdminPostgresRuntime} from "./postgres-runtime";

/**
 * Contract for a human-reviewed, category-specific Article 5(1)(e)/30 inventory.
 * Sources are explicit; no SQL identifiers are ever supplied by the browser.
 * A recorded review is NOT an automated retention instruction or an independent legal opinion.
 */
export const MAZI_RETENTION_CATEGORIES=[
 {key:"interest_intake",title:"Αιτήσεις ενδιαφέροντος και ΓΕΜΗ",sources:["mazi_interest_applications","mazi_interest_events","mazi_interest_registry_rechecks"],focus:"Απορριφθείσες, εγκαταλειμμένες, επανέλεγχοι, νόμιμο συμφέρον"},
 {key:"invitations_acceptance",title:"Προσκλήσεις, Auth και αποδοχές",sources:["mazi_invitations","mazi_invitation_acceptances","mazi_passwordless_email_attempts","mazi_auth_delivery_probes"],focus:"Μη χρησιμοποιημένοι σύνδεσμοι, αποδείξεις αποδοχής και πάροχος email"},
 {key:"members_identity",title:"Μέλη, KYB και εκπροσώπηση",sources:["mazi_members","mazi_membership_applications","mazi_application_followups"],focus:"Ατομικά επαγγελματικά δεδομένα και διακοπή συμμετοχής"},
 {key:"community_content",title:"Forum, Livechat, ιδιωτικά μηνύματα",sources:["mazi_chat_messages","mazi_forum_threads","mazi_forum_replies","mazi_inquiry_messages"],focus:"Δικαιώματα συνομιλητών, ορατότητα, διαγραφή ή ανωνυμοποίηση"},
 {key:"marketplace_listings",title:"B2B αγγελίες και συναλλακτικές αποδοχές",sources:["mazi_marketplace_listings","mazi_listing_inquiries","mazi_goods_terms_acceptances"],focus:"Λήξη αγγελίας, ανοιχτές διαφορές και εκδόσεις συμφωνιών"},
 {key:"moderation",title:"Αναφορές και διαχείριση περιεχομένου",sources:["mazi_community_reports"],focus:"Ιδιωτικότητα καταγγέλλοντος, ενστάσεις και εκκρεμείς υποθέσεις"},
 {key:"marketing",title:"Συλλογικό marketing και δημιουργικά",sources:["mazi_marketing_preferences","mazi_marketing_briefs","mazi_marketing_creative_invitations","mazi_marketing_creative_events","mazi_marketing_brief_events"],focus:"Ανακλητές επιλογές, δικαιώματα δημιουργικού και αποδεικτικά ενεργειών"},
 {key:"services",title:"Tokens, παροχή υπηρεσιών και briefs",sources:["mazi_service_requests","mazi_service_messages","mazi_service_events","mazi_service_order_acceptances","mazi_service_catalog","mazi_service_release_state"],focus:"Επαγγελματικά αρχεία, παραδοτέα και συμβατικές αποδείξεις"},
 {key:"finance",title:"Λογιστικά, ταμείο και οικονομικές δεσμεύσεις",sources:["mazi_service_periods","mazi_fund_ledger","mazi_grant_award_offers","mazi_fund_reconciliations","mazi_grant_award_acknowledgements","mazi_fund_project_updates","mazi_fund_public_events"],focus:"Αρχεία συναλλαγών, ελληνικές νόμιμες διατηρήσεις, ενεργές αξιώσεις"},
 {key:"votes_governance",title:"Ψηφοφορίες και διακυβέρνηση",sources:["mazi_votes","mazi_fund_ballots","mazi_vote_conflicts","mazi_fund_electorate","mazi_cycles","mazi_cycle_results","mazi_fund_ballot_invalidations","mazi_fund_cycle_rules","mazi_fund_round_finalizations","mazi_fund_vote_results","mazi_vote_invalidations","mazi_proposals","mazi_proposal_results"],focus:"Μυστικότητα ατομικής ψήφου, αναγκαία επαληθευσιμότητα"},
 {key:"audit_and_rights",title:"Αιτήματα GDPR, ελεγκτικό ιστορικό και approvals",sources:["mazi_privacy_requests","mazi_privacy_request_events","mazi_breach_cases","mazi_breach_case_events","mazi_processor_reviews","mazi_audit_events","mazi_launch_gate_reviews","mazi_administrators"],focus:"Ελαχιστοποίηση αρχείων, νόμιμα holds και όριο immutable-audit"},
 {key:"infrastructure_processors",title:"Εξωτερικά συστήματα, cookies, backups, processors",sources:[],focus:"Resend, Supabase Auth, Vercel, logs, backups, μεταφορές εκτός ΕΟΧ, πραγματικές DPAs"}
] as const;
export type MaziRetentionCategoryKey=(typeof MAZI_RETENTION_CATEGORIES)[number]["key"];
export const MAZI_RETENTION_CHECKS=[
 {id:"sources_mapped",label:"Κατέγραψα τις πραγματικές βάσεις, exports, storage, email και εφαρμοστέες ροές δεδομένων."},
 {id:"lawful_basis_reviewed",label:"Έλεγξα σκοπό, αναγκαιότητα και νόμιμη βάση (GDPR άρθρα 5–6 και 30)."},
 {id:"time_trigger_reviewed",label:"Τεκμηρίωσα ισχύουσα αφετηρία και μέγιστη περίοδο ανά πραγματική υποκατηγορία."},
 {id:"deletion_and_holds_tested",label:"Δοκίμασα την εφαρμόσιμη διαδικασία διαγραφής/ανωνυμοποίησης και τις εξαιρέσεις legal hold."},
 {id:"processors_backups_checked",label:"Έλεγξα αποθηκευτικά μέσα, αποδέκτες, εκτελούντες, αντίγραφα ασφαλείας και σχετικές διαβιβάσεις."},
 {id:"counsel_evidence_obtained",label:"Έχω υπαρκτά τεκμήρια έγκρισης της συγκεκριμένης κατηγορίας από υπεύθυνο επεξεργασίας και αρμόδιο νομικό σύμβουλο."}
] as const;
type RecordRow={id:string;category_key:MaziRetentionCategoryKey;review_state:"evidence_recorded"|"reopened";review_checks:string[];evidence_reference:string;review_summary:string;recorded_at:Date};
const pool=()=>getAdminPostgresRuntime().nativePool;
const evidenceValid=(s:string)=>s.length>=12&&s.length<=180&&/^[A-Za-z0-9_./:#-]+$/.test(s);
export function validateRetentionReview(input:{
 categoryKey:string;state:string;checks:readonly string[];reference:string;summary:string
}):boolean{
 if(!MAZI_RETENTION_CATEGORIES.some(c=>c.key===input.categoryKey))return false;
 if(!["evidence_recorded","reopened"].includes(input.state))return false;
 if(!evidenceValid(input.reference.trim())||input.summary.trim().length<40||input.summary.trim().length>600)return false;
 if(input.state==="reopened")return true;
 const actual=new Set(input.checks);
 const required=new Set(MAZI_RETENTION_CHECKS.map(c=>c.id));
 return actual.size===required.size && input.checks.length===required.size
  && [...actual].every(id=>required.has(id as (typeof MAZI_RETENTION_CHECKS)[number]["id"]));
}
export async function readMaziRetentionReviews(principal:SessionPrincipal):Promise<{
 latest:RecordRow[];history:RecordRow[];missingSources:string[];unmappedSources:string[]
}>{
 await marketplaceMaziActor(principal);
 const [a,b,tables]=await Promise.all([
  pool().query<RecordRow>(`SELECT DISTINCT ON (category_key)
   id::text,category_key,review_state,review_checks,evidence_reference,review_summary,recorded_at
   FROM public.mazi_retention_category_reviews ORDER BY category_key,recorded_at DESC,id DESC`),
  pool().query<RecordRow>(`SELECT id::text,category_key,review_state,review_checks,
   evidence_reference,review_summary,recorded_at FROM public.mazi_retention_category_reviews
   ORDER BY recorded_at DESC,id DESC LIMIT 30`),
  pool().query<{tablename:string}>(`SELECT tablename FROM pg_catalog.pg_tables
   WHERE schemaname='public' AND tablename LIKE 'mazi_%'`)
 ]);
 const names=new Set(tables.rows.map(row=>row.tablename));
 const covered=new Set<string>(MAZI_RETENTION_CATEGORIES.flatMap(c=>[...c.sources]));
 const missingSources=[...covered].filter(source=>!names.has(source)).sort();
 const unmappedSources=[...names].filter(source=>!covered.has(source)
  && source!=="mazi_retention_category_reviews").sort();
 return {latest:a.rows,history:b.rows,missingSources,unmappedSources};
}
/** All categories must have independently documented real evidence; this is
 * an additional fail-closed release prerequisite, never automatic counsel approval. */
export async function maziRetentionReviewsComplete(principal:SessionPrincipal):Promise<boolean>{
 const {latest,missingSources,unmappedSources}=await readMaziRetentionReviews(principal);
 return missingSources.length===0&&unmappedSources.length===0&&MAZI_RETENTION_CATEGORIES.every(c=>
  latest.find(r=>r.category_key===c.key)?.review_state==="evidence_recorded");
}
export async function recordMaziRetentionCategoryReview(principal:SessionPrincipal,input:{
 categoryKey:string;state:string;checks:readonly string[];reference:string;summary:string
}):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!validateRetentionReview(input))throw Error("MAZI_RETENTION_REVIEW_INVALID");
 const checks=input.state==="evidence_recorded"?input.checks:[];
 const res=await pool().query(`INSERT INTO public.mazi_retention_category_reviews
  (category_key,review_state,review_checks,evidence_reference,review_summary,actor_user_id)
  VALUES($1,$2,$3::text[],$4,$5,$6::uuid) RETURNING id`,[
  input.categoryKey,input.state,checks,input.reference.trim(),input.summary.trim(),actor
 ]);
 if(res.rowCount!==1)throw Error("MAZI_RETENTION_REVIEW_NOT_SAVED");
}

import type {MaziOperationsSnapshot,MaziLaunchGateKey,MaziLaunchGateReview} from "./mazi-operations";

/** Readiness diagnosis only. NEVER an authorization to send mail, merge a PR,
 * accept payments, start a grant, or open registration.
 */
export type MaziReleaseReadiness={
 evidenceGatesVerified:number;
 evidenceGatesTotal:3;
 financeLocked:boolean;
 invitationAuditCoherent:boolean;
 admissionExceptions:number;
 prerequisitesRecorded:boolean;
 blockers:string[];
 manualReleaseStillRequired:true;
};

const requiredGates:MaziLaunchGateKey[]=[
 "auth_email_delivery","legal_and_retention","consenting_business_e2e"
];
export function assessMaziReleaseReadiness(
 state:MaziOperationsSnapshot,gates:readonly MaziLaunchGateReview[]
):MaziReleaseReadiness{
 const latest=new Map<MaziLaunchGateKey,MaziLaunchGateReview>();
 for(const gate of gates){
  const prior=latest.get(gate.gate_key);
  const currentAt=new Date(gate.recorded_at).getTime();
  const priorAt=prior?new Date(prior.recorded_at).getTime():-Infinity;
  if(!prior || currentAt>priorAt ||
    (currentAt===priorAt&&BigInt(gate.id)>BigInt(prior.id))){
    latest.set(gate.gate_key,gate);
  }
 }
 const financeLocked=state.finance_enabled_cycles===0&&state.ledger_total===0&&
  state.grant_offers_total===0&&state.safe_founding_cycles===1;
 const invitationAuditCoherent=state.acceptances===state.invitations_consumed;
 const admissionExceptions=state.invitations_delivery_unconfirmed+
   state.invitations_delivery_failed+state.invitations_expired_unconsumed+
   state.interest_registry_stale;
 const evidenceGatesVerified=requiredGates.filter(key=>latest.get(key)?.decision==="verified").length;
 const blockers:string[]=[];
 if(!financeLocked)blockers.push("Ο ιδρυτικός κύκλος ή κάποια οικονομική εγγραφή αποκλίνει από τη μη οικονομική λειτουργία.");
 if(!invitationAuditCoherent)blockers.push("Οι καταγεγραμμένες αποδοχές δεν συμφωνούν με τις χρησιμοποιημένες προσκλήσεις.");
 if(admissionExceptions>0)blockers.push("Υπάρχουν εκκρεμείς αποστολές, ληγμένες προσκλήσεις ή έλεγχοι ΓΕΜΗ προς επανεξέταση.");
 for(const key of requiredGates){
  if(latest.get(key)?.decision!=="verified"){
   const labels:Record<MaziLaunchGateKey,string>={
    auth_email_delivery:"Ο έλεγχος Supabase Auth/SMTP/callback δεν έχει τεκμηριωθεί ως ολοκληρωμένος.",
    legal_and_retention:"Δεν έχει τεκμηριωθεί ολοκληρωμένος νομικός έλεγχος και πολιτική διατήρησης δεδομένων.",
    consenting_business_e2e:"Δεν έχει καταγραφεί ολοκληρωμένη ένταξη πραγματικής συναινούσας επιχείρησης."
   };
   blockers.push(labels[key]);
  }
 }
 return {
  evidenceGatesVerified,evidenceGatesTotal:3,financeLocked,invitationAuditCoherent,
  admissionExceptions,prerequisitesRecorded:blockers.length===0,
  blockers,manualReleaseStillRequired:true
 };
}

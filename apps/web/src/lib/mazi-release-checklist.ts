/** MAZI human release attestation checklist. The checks are NOT proof of provider delivery
 * or counsel sign-off on their own. All remain pending until real evidence is gathered.
 * Keeping this contract in a pure module permits deterministic build checks.
 */
export const MAZI_AUTH_RELEASE_CHECKS=[
 {id:"auth.project",label:"Επιβεβαίωσα το σωστό Supabase project και τη server-only διαμόρφωση του Auth."},
 {id:"auth.smtp",label:"Έλεγξα στο Supabase την ενεργοποίηση και πραγματική διαμόρφωση custom SMTP και τη διεύθυνση αποστολέα."},
 {id:"auth.dns",label:"Επαλήθευσα SPF, DKIM και DMARC στον πάροχο αποστολής."},
 {id:"auth.redirect",label:"Επαλήθευσα το allowlist redirect και το callback στο mazi.kontamou.site χωρίς ανοικτά wildcards."},
 {id:"auth.otp",label:"Έλεγξα την πραγματική διάρκεια OTP, το όριο αποδοχής των 45 λεπτών και τις δύο φόρμες email."},
 {id:"auth.delivery",label:"Έκανα εξουσιοδοτημένο πραγματικό τεστ αποστολής/παράδοσης σε συναινούντα παραλήπτη και έλεγξα callback/email ownership."},
 {id:"auth.reconcile",label:"Επιβεβαίωσα ότι μπορώ να διαγνώσω αποτυχία, bounce και διπλή πρόσκληση πριν από οποιαδήποτε επανέκδοση."}
] as const;
export const MAZI_LEGAL_RELEASE_CHECKS=[
 {id:"legal.controller",label:"Επαλήθευσα τα στοιχεία του υπευθύνου επεξεργασίας και τις πραγματικές νόμιμες βάσεις GDPR."},
 {id:"legal.documents",label:"Έλεγξα τους δημοσιευμένους όρους v1, το Privacy και τη ρητή αποδοχή μη οικονομικής συμμετοχής."},
 {id:"legal.retention",label:"Ενέκρινα συγκεκριμένη πολιτική διατήρησης ανά κατηγορία μετά από νομικό έλεγχο (όχι μόνο το προσχέδιο)."},
 {id:"legal.deletion",label:"Έλεγξα εφαρμόσιμη διαγραφή/ανωνυμοποίηση, νομικά holds και immutable-audit εξαιρέσεις."},
 {id:"legal.rights",label:"Επαλήθευσα ότι το κανάλι info@kontamou.site δέχεται και χειρίζεται αιτήματα δικαιωμάτων GDPR."},
 {id:"legal.processors",label:"Έλεγξα DPAs, υποεκτελούντες, διαβιβάσεις, αντίγραφα ασφαλείας και τη διαδικασία περιστατικών."},
 {id:"legal.counsel",label:"Έχω τεκμηριωμένη τελική έγκριση για τη δημοσίευση από τον υπεύθυνο και αρμόδιο νομικό σύμβουλο."}
] as const;

export function requiredMaziChecks(gate:string):readonly {id:string;label:string}[]{
 if(gate==="auth_email_delivery")return MAZI_AUTH_RELEASE_CHECKS;
 if(gate==="legal_and_retention")return MAZI_LEGAL_RELEASE_CHECKS;
 return [];
}
export function validateMaziGateChecklist(
 gateKey:string,decision:string,completed:readonly string[],reference:string
):boolean {
 if(decision!=="verified")return true;
 const required=requiredMaziChecks(gateKey);
 if(!required.length)return true; // Real-business admission has a separate database proof gate.
 const actual=new Set(completed);
 const allowed=new Set(required.map(x=>x.id));
 return actual.size===required.length &&
  required.every(x=>actual.has(x.id)) &&
  [...actual].every(k=>allowed.has(k)) &&
  reference.trim().length>=12 && reference.trim().length<=250;
}
export function formatMaziEvidence(evidence:string,reference:string,checkKeys:readonly string[]):string{
 return [
   evidence.trim(),
   "Αποδεικτικά: "+reference.trim(),
   "Βεβαιωμένα σημεία: "+checkKeys.join(",")
 ].join("\n");
}

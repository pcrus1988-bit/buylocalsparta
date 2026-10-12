import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../../lib/fiscal-auth";
import {FiscalRecoveryWorkbench} from "../../../../components/FiscalRecoveryWorkbench";
import {fiscalRecoveryReadiness} from "../../../../lib/fiscal-mfa-recovery";
export const dynamic="force-dynamic";
export default async function FiscalMfaRecovery(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const readiness=await fiscalRecoveryReadiness(actor).catch(()=>null);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio-admin/mfa">Πίσω στο MFA</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Governed account recovery</div>
   <h1>Ανάκτηση επαληθευτή MFA</h1>
   <p>Μόνο μετά από δύο ανεξάρτητες εγκρίσεις εποπτών, με πρόσφατη MFA επαλήθευση και εξωτερική τεκμηρίωση ταυτότητας.</p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{maxWidth:850}}>
   <h2>Ετοιμότητα διαδικασίας ανάκτησης</h2>
   {!readiness?<p className="fiscal-alert">Η ετοιμότητα δεν ήταν δυνατό να επαληθευτεί. Μην ενεργοποιήσετε την ανάκτηση.</p>:
    <p>Ενεργές εγγραφές MFA εποπτών: <strong>{readiness.enrolledSuperadminFactors}</strong> / ελάχιστο <strong>{readiness.minimumForSuperadminRecovery}</strong> για ανάκτηση εποπτικού λογαριασμού.
    {" · "}Migration: <strong>{readiness.schemaPresent?"Διαθέσιμη":"Εκκρεμεί"}</strong>
    {" · "}Μηχανισμός: <strong>{readiness.recoveryEnabled?"Ενεργός":"Ανενεργός"}</strong>
    {" · "}Υποχρεωτικό MFA: <strong>{readiness.enforced?"Ενεργό":"Ανενεργό"}</strong>
    {" · "}Υποδομή ειδοποιήσεων: <strong>{readiness.alertSchemaPresent?"Υπάρχει":"Εκκρεμεί"}</strong>
    {" · "}Επαληθευμένες επαφές αποδέκτη/ασφάλειας: <strong>{readiness.verifiedAlertContacts?"Ναι":"Όχι"}</strong>
    {" · "}Διανομή ειδοποιήσεων: <strong>{readiness.alertDeliveryConfigured?"Ρυθμισμένη":"Μη ρυθμισμένη"}</strong>
    {" · "}Υπογεγραμμένες αποδείξεις επίδοσης: <strong>{readiness.signedWebhookConfigured?"Ρυθμισμένες":"Μη ρυθμισμένες"}</strong>
    {" · "}Συμφωνία γεγονότων παρόχου: <strong>{readiness.providerReconciliationEnabled?"Ενεργή":"Μη ενεργή"}</strong>
    {" · "}Ουρά συμφωνίας: <strong>{readiness.providerReconciliationSchemaPresent?"Έτοιμη":"Εκκρεμεί"}</strong></p>}
   <p className="fiscal-muted">Ο αριθμός εγγραφών authenticator δεν αποδεικνύει ότι πρόκειται για τρία ανεξάρτητα φυσικά πρόσωπα. Απαιτούνται χωριστοί εξουσιοδοτημένοι εποπτικοί λογαριασμοί, δοκιμές ανάκτησης και εγκεκριμένη offline διαδικασία.</p>
  </section>
  {actor.kind==="marketplace_super_admin"?<section className="fiscal-panel fiscal-section" style={{maxWidth:850}}>
   <h2>Ειδοποιήσεις ασφάλειας</h2>
   <p>Επισκόπηση εκκρεμών, αποδεκτών και αποτυχημένων ειδοποιήσεων (απαιτείται πρόσφατο MFA).</p>
   <p><Link href="/timologio-admin/mfa/alerts" className="fiscal-button secondary">Ασφαλής παρακολούθηση ειδοποιήσεων</Link></p>
  </section>:null}
  <FiscalRecoveryWorkbench csrfToken={actor.csrfToken}/>
 </div></main>;
}

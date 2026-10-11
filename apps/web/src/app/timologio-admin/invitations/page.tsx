import {fiscalMfaEnforced,isFiscalMfaSatisfied} from "../../../lib/fiscal-operator-mfa";
import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalDatabaseConfigured} from "../../../lib/fiscal-runtime";
import {invitedRegistrationEnabled,listFiscalInvitations} from "../../../lib/fiscal-invitations";
import {FiscalInvitationWorkbench,FiscalInvitationRevoke} from "../../../components/FiscalInvitationWorkbench";
export const dynamic="force-dynamic";
const format=(d:Date)=>new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"short"}).format(new Date(d));
export default async function FiscalInvitations(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 if(fiscalMfaEnforced()&&!(await isFiscalMfaSatisfied(actor)))redirect("/timologio-admin/mfa");
 const ready=fiscalDatabaseConfigured(),enabled=invitedRegistrationEnabled();
 const invites=ready?await listFiscalInvitations().catch(()=>null):null;
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio-admin">Κέντρο ελέγχου</Link><Link href="/timologio-admin/compliance">Πιστοποιήσεις</Link></nav>
  </header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Ελεγχόμενη εισαγωγή επιχειρήσεων</div>
   <h1>Προσκλήσεις FISCAL</h1><p>Προσωπικές, εφάπαξ προσκλήσεις αντί δημόσιας εγγραφής.</p>
  </section>
  <p className="fiscal-alert">Οι προσκλήσεις δεν ταυτοποιούν νομίμους εκπροσώπους και δεν ενεργοποιούν λογιστική έκδοση, πληρωμές POS ή διαβίβαση AADE.</p>
  {!ready||!invites?<p className="fiscal-alert">Η απομονωμένη βάση FISCAL ή η δομή προσκλήσεων δεν είναι διαθέσιμη.</p>:
   !enabled?<p className="fiscal-alert">Η δημιουργία και αποδοχή προσκλήσεων είναι απενεργοποιημένη. Απαιτείται ρητή ενεργοποίηση της υπηρεσίας.</p>
   :<FiscalInvitationWorkbench csrfToken={actor.csrfToken}/>}
  {invites?<section className="fiscal-panel fiscal-section">
   <h2>Πρόσφατες προσκλήσεις · έως 30</h2>
   <p className="fiscal-muted">Αποθηκεύονται μόνο οι κατακερματισμένες τιμές των κωδικών. Οι εφάπαξ σύνδεσμοι δεν μπορούν να ανακτηθούν μετά τη δημιουργία.</p>
   {!invites.length?<p>Δεν έχουν δημιουργηθεί προσκλήσεις.</p>:
    <div style={{overflowX:"auto"}}><table className="fiscal-table">
     <thead><tr><th>Επιχείρηση</th><th>Παραλήπτης</th><th>ΑΦΜ</th><th>Κατάσταση</th><th>Ημ/νία λήξης</th><th>Ενέργεια</th></tr></thead>
     <tbody>{invites.map(i=><tr key={i.id}>
      <td>{i.legal_name}</td><td>{i.email}</td><td>{i.vat_number}</td>
      <td>{i.status==="pending"&&new Date(i.expires_at)<new Date()?"expired":i.status}</td>
      <td>{format(i.expires_at)}</td>
      <td>{i.status==="pending"?<FiscalInvitationRevoke id={i.id} csrfToken={actor.csrfToken}/>:<span className="fiscal-muted">—</span>}</td>
     </tr>)}</tbody>
    </table></div>}
  </section>:null}
 </div></main>;
}

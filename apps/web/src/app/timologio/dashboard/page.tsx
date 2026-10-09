import Link from "next/link";
import { redirect } from "next/navigation";
import { FiscalLogoutButton } from "../../../components/FiscalLogoutButton";
import { fiscalCsrfValue, fiscalMerchantAccounts, getFiscalActor } from "../../../lib/fiscal-auth";
import { fiscalLanes } from "../../../lib/fiscal-runtime";
export const dynamic="force-dynamic";
export default async function FiscalDashboard(){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role==="fiscal_admin")redirect("/timologio-admin");
 const [accounts,csrf]=await Promise.all([fiscalMerchantAccounts(actor),fiscalCsrfValue()]);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><span>{actor.email}</span>{csrf&&<FiscalLogoutButton csrfToken={csrf}/>}</nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Business workspace</div><h1>Η επιχείρησή σας</h1>
   <p>Αυτός είναι ένας ανεξάρτητος λογαριασμός FISCAL. Η σύνδεση με το marketplace θα είναι προαιρετική και ελεγχόμενη.</p></section>
  <section className="fiscal-panel"><h2>Επιχειρήσεις και έλεγχος</h2>
   {accounts.length===0?<p className="fiscal-alert">Δεν υπάρχει ακόμη επιχείρηση συνδεδεμένη με αυτόν τον λογαριασμό.</p>:
   <div className="fiscal-grid">{accounts.map(account=><article key={account.id} className="fiscal-card">
    <small>ΑΦΜ · {account.vat_number}</small><h3>{account.legal_name}</h3>
    <p>Κατάσταση: <strong>{account.status}</strong></p><p>Ρόλος: {account.role}</p>
   </article>)}</div>}
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}><h2>Κλάδοι παραστατικών</h2>
   <div className="fiscal-grid">{fiscalLanes.map(lane=><article key={lane.id} className="fiscal-card">
    <h3>{lane.title}</h3><p>{lane.detail}</p><small>Υπό ανάπτυξη / πιστοποίηση</small>
   </article>)}</div>
   <p className="fiscal-alert" style={{marginTop:20}}>Η δημιουργία, υπογραφή, διαβίβαση και επίσημη έκδοση παραστατικών δεν είναι διαθέσιμη. Θα ενεργοποιηθεί μόνο μετά από τις κατάλληλες πιστοποιήσεις και ελέγχους.</p>
  </section>
 </div></main>;
}

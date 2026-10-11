import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalCsrfValue,getFiscalActor} from "../../../lib/fiscal-auth";
import {FiscalJournalWorkbench} from "../../../components/FiscalJournalWorkbench";

export const dynamic="force-dynamic";
export default async function FiscalJournalPage(){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const csrf=await fiscalCsrfValue();
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Οι επιχειρήσεις μου</Link><Link href="/timologio/drafts">Δοκιμαστικά drafts</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">ERP foundation · Internal simulation</div>
   <h1>Δοκιμαστικό λογιστικό ημερολόγιο</h1>
   <p>Πρώτο βήμα προς κοινό μηχανισμό συναλλαγών για B2C, B2B, B2G και POS, χωρίς λειτουργία νόμιμης λογιστικής καταχώρισης.</p>
  </section>
  <p className="fiscal-alert"><strong>Περιβάλλον δοκιμών.</strong> Η προσομοίωση δεν αποτελεί επίσημο λογιστικό σύστημα, βιβλίο, τιμολόγιο ή παραστατικό και δεν τηρεί ιστορικό εγγραφών.</p>
  {csrf?<FiscalJournalWorkbench csrfToken={csrf}/>:<p role="alert">Δεν βρέθηκε έγκυρη συνεδρία για προσομοίωση. Συνδεθείτε ξανά.</p>}
 </div></main>;
}

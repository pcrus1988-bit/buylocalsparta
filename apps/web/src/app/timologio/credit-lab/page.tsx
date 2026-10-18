import Link from "next/link";
import {redirect} from "next/navigation";
import {getFiscalActor} from "../../../lib/fiscal-auth";
import {FiscalCreditLab} from "../../../components/FiscalCreditLab";

export const dynamic="force-dynamic";

export default async function FiscalCreditLabPage(){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Η επιχείρησή μου</Link><Link href="/timologio/drafts">Test drafts</Link><Link href="/timologio/journal">Δοκιμαστικό ημερολόγιο</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">M24 · Credit laboratory · Local-only</div>
   <h1>Εργαστήριο πιστώσεων</h1>
   <p>Δοκίμασε μερικές και πλήρεις πιστώσεις σε τεχνητά δεδομένα, πριν σχεδιαστεί οποιαδήποτε επίσημη διαδικασία έκδοσης.</p>
  </section>
  <FiscalCreditLab/>
 </div></main>;
}

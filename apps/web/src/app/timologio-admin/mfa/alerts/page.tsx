import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../../lib/fiscal-auth";
import {isFiscalMfaSatisfied} from "../../../../lib/fiscal-operator-mfa";
import {FiscalSecurityAlertsPanel} from "../../../../components/FiscalSecurityAlertsPanel";
export const dynamic="force-dynamic";
export default async function FiscalSecurityAlertsPage(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 if(actor.kind!=="marketplace_super_admin")redirect("/timologio-admin");
 if(!(await isFiscalMfaSatisfied(actor)))redirect("/timologio-admin/mfa");
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · SECURITY</span></Link>
   <nav><Link href="/timologio-admin/mfa/recovery">Ανάκτηση MFA</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Independent security observability</div>
   <h1>Ειδοποιήσεις ασφάλειας MFA</h1>
   <p>Ασφαλής, μόνο για ανάγνωση παρακολούθηση ουράς. Η αποδοχή από τον πάροχο δεν επιβεβαιώνει παράδοση στο γραμματοκιβώτιο.</p>
  </section>
  <FiscalSecurityAlertsPanel/>
 </div></main>;
}

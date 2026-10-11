import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../../lib/fiscal-auth";
import {FiscalRecoveryWorkbench} from "../../../../components/FiscalRecoveryWorkbench";
export const dynamic="force-dynamic";
export default async function FiscalMfaRecovery(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio-admin/mfa">Πίσω στο MFA</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Governed account recovery</div>
   <h1>Ανάκτηση επαληθευτή MFA</h1>
   <p>Μόνο μετά από δύο ανεξάρτητες εγκρίσεις εποπτών, με πρόσφατη MFA επαλήθευση και εξωτερική τεκμηρίωση ταυτότητας.</p>
  </section>
  <FiscalRecoveryWorkbench csrfToken={actor.csrfToken}/>
 </div></main>;
}

import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalMfaStatus} from "../../../lib/fiscal-operator-mfa";
import {FiscalOperatorMfaWorkbench} from "../../../components/FiscalOperatorMfaWorkbench";
export const dynamic="force-dynamic";
export default async function FiscalMfaPage(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const initial=await fiscalMfaStatus(actor);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
 <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
 <nav><Link href="/timologio-admin">Κέντρο ελέγχου</Link></nav></header>
 <section className="fiscal-hero"><div className="fiscal-kicker">Operator session security</div>
 <h1>Έλεγχος δύο παραγόντων</h1>
 <p>Δεύτερος παράγοντας για ευαίσθητες ενέργειες διαχειριστή FISCAL. Δεν αλλάζει το υφιστάμενο SSO.</p></section>
 <FiscalOperatorMfaWorkbench csrfToken={actor.csrfToken} initial={initial}/>
 <section className="fiscal-panel fiscal-section"><h2>Ανάκτηση Authenticator</h2><p>Ελεγχόμενη διαδικασία δύο ανεξάρτητων εγκρίσεων · απενεργοποιημένη μέχρι να ολοκληρωθεί η αξιολόγηση.</p><p><Link href="/timologio-admin/mfa/recovery" className="fiscal-button secondary">Διαδικασία ανάκτησης MFA</Link></p></section>
 </div></main>;
}

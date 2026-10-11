import Link from "next/link";
import { redirect } from "next/navigation";
import { FiscalAuthForm } from "../../../components/FiscalAuthForm";
import { getFiscalActor } from "../../../lib/fiscal-auth";
export default async function Login(){
 const actor=await getFiscalActor();
 if(actor)redirect(actor.role==="fiscal_admin"?"/timologio-admin":"/timologio/dashboard");
 return <main className="fiscal-shell"><div className="fiscal-wrap"><header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link></header>
 <section className="fiscal-panel" style={{maxWidth:550}}><h1>Είσοδος στο FISCAL</h1><p className="fiscal-muted">Ανεξάρτητος λογαριασμός, χωρίς απαίτηση συμμετοχής στο marketplace.</p><FiscalAuthForm mode="login"/></section>
 </div></main>;
}

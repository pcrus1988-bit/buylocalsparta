import Link from "next/link";
import { redirect } from "next/navigation";

import { FiscalAuthForm } from "../../../components/FiscalAuthForm";
import { fiscalAdminActor } from "../../../lib/fiscal-auth";
export default async function FiscalAdminLogin(){
 if(await fiscalAdminActor())redirect("/timologio-admin");
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link className="fiscal-brand" href="/timologio">KONTA MOY <span>FISCAL</span></Link></header>
  <section className="fiscal-panel" style={{maxWidth:650}}><h1>Fiscal Administration</h1>
  <p className="fiscal-muted">Ξεχωριστός χώρος διαχείρισης FISCAL. Οι ενεργοί λογαριασμοί KONTA MOY super_admin έχουν εποπτική πρόσβαση, χωρίς νέα διαπιστευτήρια.</p>
  <h2>KONTA MOY Super Admin</h2>
  {process.env.FISCAL_STANDALONE_MODE==="true"?
   <a className="fiscal-button" href={(process.env.FISCAL_MARKETPLACE_BASE_URL||"https://kontamou.site").replace(/\/$/,"")+"/admin/fiscal-access"}>Σύνδεση με KONTA MOY super admin</a>:
   <p>Χρησιμοποιήστε την υπάρχουσα συνεδρία του KONTA MOY super admin ή ανοίξτε <Link href="/admin/fiscal-access">την εξουσιοδοτημένη πρόσβαση FISCAL</Link>.</p>}
  <hr style={{margin:"28px 0",borderColor:"#dce9e5"}}/>
  <h2>Dedicated Fiscal Administrator</h2><FiscalAuthForm mode="login"/>
  </section></div></main>;
}

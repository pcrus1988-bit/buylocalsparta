import Link from "next/link";
import {FiscalInvitationAccept} from "../../../components/FiscalInvitationAccept";
export const dynamic="force-dynamic";
export const metadata={title:"FISCAL · Ειδική πρόσκληση",robots:{index:false,follow:false}};
export default function InvitationPage(){
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Ελεγχόμενη πρόσβαση</div>
   <h1>Αποδοχή προσωπικής πρόσκλησης</h1>
   <p>Ο σύνδεσμος ισχύει για 48 ώρες και μόνο μία χρήση. Δεν επιτρέπει έκδοση παραστατικών.</p>
  </section>
  <FiscalInvitationAccept/>
 </div></main>;
}

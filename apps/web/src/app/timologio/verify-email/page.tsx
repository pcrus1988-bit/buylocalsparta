import Link from "next/link";
import {FiscalEmailVerificationClaim} from "../../../components/FiscalEmailVerification";
export const dynamic="force-dynamic";
export const metadata={title:"FISCAL · Επιβεβαίωση email",robots:{index:false,follow:false}};
export default function VerifyFiscalEmail(){
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link className="fiscal-brand" href="/timologio">KONTA MOY <span>FISCAL</span></Link></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Email ownership</div>
   <h1>Επιβεβαίωση email</h1>
   <p>Ασφαλής, εφάπαξ απόδειξη πρόσβασης στη διεύθυνσή σας. Δεν αποτελεί επαλήθευση ΓΕΜΗ ή ΑΑΔΕ.</p>
  </section>
  <FiscalEmailVerificationClaim/>
 </div></main>;
}

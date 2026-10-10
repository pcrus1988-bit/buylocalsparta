import Link from "next/link";
import { FiscalAuthForm } from "../../../components/FiscalAuthForm";
export default function Register(){
 return <main className="fiscal-shell"><div className="fiscal-wrap"><header className="fiscal-topbar"><Link className="fiscal-brand" href="/timologio">KONTA MOY <span>FISCAL</span></Link></header>
 <section className="fiscal-panel" style={{maxWidth:590}}><h1>Εγγραφή επιχείρησης</h1>
 <p className="fiscal-muted">Η καταχώριση δημιουργεί αίτηση προς έλεγχο, όχι ενεργή δυνατότητα έκδοσης παραστατικών. Η πρόσβαση ανοίγει σταδιακά.</p>
 {process.env.FISCAL_REGISTRATION_ENABLED==="true" ? <FiscalAuthForm mode="register"/> :
 <p className="fiscal-alert">Η εγγραφή δεν έχει ενεργοποιηθεί ακόμη. Απαιτείται ξεχωριστή βάση FISCAL, ενεργοποίηση και έλεγχος διαδικασίας ταυτοποίησης.</p>}
 </section></div></main>;
}

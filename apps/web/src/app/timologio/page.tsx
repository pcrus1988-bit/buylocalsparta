import Link from "next/link";
import { fiscalLanes } from "../../lib/fiscal-runtime";
export default function FiscalHome(){
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
  <nav><Link href="/timologio/login">Σύνδεση</Link><Link href="/timologio/register">Εγγραφή</Link><Link href="/timologio-admin">Fiscal Admin</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Independent fiscal technology platform</div>
  <h1>Η οικονομική λειτουργία της επιχείρησής σου, σε μία ενιαία υπηρεσία.</h1>
  <p>Ανεξάρτητο περιβάλλον για επιχειρήσεις, με σχεδιασμό για B2C, POS, B2B και B2G και προαιρετική διασύνδεση με το KONTA MOY Marketplace ή εξωτερικά ERP.</p>
  <div className="fiscal-actions"><Link className="fiscal-button" href="/timologio/register">Εκδήλωση ενδιαφέροντος</Link>
  <Link className="fiscal-button secondary" href="/timologio/login">Είσοδος συνεργάτη</Link></div>
  </section>
  <section className="fiscal-panel fiscal-section"><h2>Τέσσερις υποδομές. Ένας λογαριασμός.</h2>
  <div className="fiscal-grid">{fiscalLanes.map(lane=><article key={lane.id} className="fiscal-card"><small>{lane.id.toUpperCase()}</small><h3>{lane.title}</h3><p>{lane.detail}</p></article>)}</div>
  <p className="fiscal-alert" style={{marginTop:22}}>Η υπηρεσία βρίσκεται σε φάση ανάπτυξης και πιστοποίησης. Δεν πραγματοποιείται νόμιμη έκδοση φορολογικών παραστατικών μέσω KONTA MOY FISCAL σε αυτό το στάδιο.</p>
  </section>
 </div></main>;
}

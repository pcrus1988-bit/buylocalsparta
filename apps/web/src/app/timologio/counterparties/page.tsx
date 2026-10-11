import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalCsrfValue,fiscalMerchantAccounts,getFiscalActor} from "../../../lib/fiscal-auth";
import {listFiscalCounterparties} from "../../../lib/fiscal-counterparties";
import {FiscalCounterpartyForm} from "../../../components/FiscalCounterpartyForm";
export const dynamic="force-dynamic";
const kind:Record<string,string>={business:"Επιχείρηση · B2B",public_body:"Δημόσιος φορέας · B2G"};
export default async function FiscalCounterpartiesPage({searchParams}:{
 searchParams:Promise<{organizationId?:string}>
}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [accounts,csrf,params]=await Promise.all([fiscalMerchantAccounts(actor),fiscalCsrfValue(),searchParams]);
 const account=params.organizationId?accounts.find(x=>x.id===params.organizationId):accounts[0];
 const rows=account?await listFiscalCounterparties(actor,account.id):[];
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Επιχειρήσεις</Link><Link href="/timologio/drafts">Πρόχειρα</Link></nav>
  </header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Merchant workspace · Unverified test data</div>
   <h1>Αντισυμβαλλόμενοι B2B / B2G</h1>
   <p>Δοκιμαστικό μητρώο επιχειρήσεων και δημόσιων φορέων, ανεξάρτητο από το marketplace.</p>
  </section>
  <section className="fiscal-panel">
   <p className="fiscal-alert"><strong>Μόνο συνθετικά στοιχεία δοκιμής.</strong> Μην εισαγάγετε στοιχεία πραγματικών προσώπων ή πελατών. Η μορφή ΑΦΜ δεν αποτελεί επαλήθευση στην ΑΑΔΕ, στο ΓΕΜΗ ή σε δημόσιο μητρώο. Δεν δημιουργούνται φορολογικά παραστατικά.</p>
   {!accounts.length?<p>Δεν υπάρχει συνδεδεμένη επιχείρηση.</p>:!account?<p role="alert">Δεν έχετε πρόσβαση σε αυτή την επιχείρηση.</p>:<>
    <form method="get" className="fiscal-form" style={{maxWidth:420}}>
     <label>Επιχείρηση<select name="organizationId" defaultValue={account.id}>
      {accounts.map(x=><option key={x.id} value={x.id}>{x.legal_name} · {x.vat_number}</option>)}
     </select></label>
     <button className="fiscal-button" type="submit">Επιλογή</button>
    </form>
    {account.status==="approved"&&["owner","accountant"].includes(account.role)&&csrf?
     <section className="fiscal-section"><h2>Νέα δοκιμαστική εγγραφή</h2>
      <FiscalCounterpartyForm key={account.id} organizationId={account.id} csrfToken={csrf}/>
     </section>:
     <p className="fiscal-muted">Η καταχώριση απαιτεί εγκεκριμένη επιχείρηση και ρόλο ιδιοκτήτη ή λογιστή.</p>}
    <section className="fiscal-section"><h2>Καταχωρισμένοι αντισυμβαλλόμενοι</h2>
     <p className="fiscal-muted">Εμφανίζονται έως 100 δοκιμαστικές εγγραφές, με τις νεότερες πρώτες. Όλες έχουν κατάσταση «μη επαληθευμένο».</p>
     {!rows.length?<p>Δεν υπάρχουν ακόμη εγγραφές.</p>:
      <div style={{overflowX:"auto"}}><table className="fiscal-table">
       <thead><tr><th>Επωνυμία</th><th>Κατηγορία</th><th>Δοκιμαστικό ΑΦΜ</th><th>Έλεγχος</th></tr></thead>
       <tbody>{rows.map(x=><tr key={x.id}>
        <td>{x.legal_name}</td><td>{kind[x.kind]}</td><td>{x.vat_number}</td><td>Μη επαληθευμένο</td>
       </tr>)}</tbody>
      </table></div>}
    </section>
    <p><Link href={"/timologio/drafts?organizationId="+encodeURIComponent(account.id)} className="fiscal-button">Επιστροφή στα δοκιμαστικά drafts</Link></p>
   </>}
  </section>
 </div></main>;
}

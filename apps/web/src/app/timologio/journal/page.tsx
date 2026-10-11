import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalCsrfValue,fiscalMerchantAccounts,getFiscalActor} from "../../../lib/fiscal-auth";
import {listFiscalSandboxJournals} from "../../../lib/fiscal-sandbox-journal-store";
import {FiscalJournalWorkbench} from "../../../components/FiscalJournalWorkbench";

export const dynamic="force-dynamic";
const euro=(minor:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(Number(minor)/100);
const date=(value:Date)=>new Intl.DateTimeFormat("el-GR",{
 timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
}).format(new Date(value));
export default async function FiscalJournalPage({searchParams}:{
 searchParams:Promise<{organizationId?:string}>
}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [csrf,accounts,params]=await Promise.all([fiscalCsrfValue(),fiscalMerchantAccounts(actor),searchParams]);
 const selected=params.organizationId?accounts.find(x=>x.id===params.organizationId):accounts[0];
 const canSave=selected?.status==="approved"&&["owner","accountant"].includes(selected.role);
 const history=selected?await listFiscalSandboxJournals(actor,selected.id):[];
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Οι επιχειρήσεις μου</Link><Link href="/timologio/drafts">Test drafts</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">ERP foundation · Private sandbox</div>
   <h1>Δοκιμαστικό λογιστικό ημερολόγιο</h1>
   <p>Αποθήκευση και έλεγχος αμετάβλητων, ισοσκελισμένων προσομοιώσεων ανά επιχείρηση.</p>
  </section>
  <p className="fiscal-alert"><strong>Όχι επίσημη λογιστική.</strong> Δεν αποτελούν βιβλία, παραστατικά, myDATA, φορολογική ταξινόμηση ή εγγραφές προς έκδοση.</p>
  {accounts.length>0?<section className="fiscal-panel fiscal-section">
   <form method="get" className="fiscal-form" style={{maxWidth:"100%"}}>
    <label>Επιλογή επιχείρησης
     <select name="organizationId" defaultValue={selected?.id??""}>
      {accounts.map(a=><option key={a.id} value={a.id}>{a.legal_name} · {a.vat_number}</option>)}
     </select>
    </label><button type="submit" className="fiscal-button">Προβολή</button>
   </form>
   {!selected?<p role="alert">Δεν έχετε πρόσβαση στην επιλεγμένη επιχείρηση.</p>
    :<p>Επιχείρηση: <strong>{selected.legal_name}</strong> · Κατάσταση: {selected.status} · Ρόλος: {selected.role}</p>}
  </section>:<p className="fiscal-muted">Δεν έχει συνδεθεί εγκεκριμένη επιχείρηση. Η προσωρινή προσομοίωση εξακολουθεί να είναι διαθέσιμη.</p>}
  {csrf?<FiscalJournalWorkbench key={selected?.id??"demo"} csrfToken={csrf} organizationId={canSave?selected?.id:undefined}/>
   :<p role="alert">Η συνεδρία δεν επιτρέπει προσομοιώσεις. Συνδεθείτε ξανά.</p>}
  {selected?<section className="fiscal-panel fiscal-section">
   <h2>Αποθηκευμένα δοκιμαστικά στιγμιότυπα · έως 20 πρόσφατα</h2>
   <p className="fiscal-muted">Οι αποθηκευμένες γραμμές δεν τροποποιούνται και δεν αναγνωρίζονται ως επίσημες συναλλαγές.</p>
   {history.length===0?<p>Δεν υπάρχουν αποθηκευμένες δοκιμές σε αυτή την επιχείρηση.</p>
    :<div style={{display:"grid",gap:12}}>
      {history.map(j=><details className="fiscal-card" key={j.id}>
       <summary><strong>{date(j.created_at)}</strong> · {j.entry_count} γραμμές · χρεώσεις/πιστώσεις {euro(j.total_debit_minor)}</summary>
       <div style={{overflowX:"auto"}}>
        <table className="fiscal-table"><thead><tr><th>Λογαριασμός test</th><th>Κίνηση</th><th>EUR</th></tr></thead>
         <tbody>{j.lines.map(l=><tr key={l.line_no}><td>{l.account_code}</td>
          <td>{l.side==="debit"?"Χρέωση":"Πίστωση"}</td><td>{euro(l.amount_minor)}</td></tr>)}</tbody>
        </table>
       </div>
       <p className="fiscal-muted">Αναγνωριστικό δοκιμής: {j.external_id} · Δεν αναρτήθηκε σε φορολογικά βιβλία.</p>
      </details>)}
     </div>}
  </section>:null}
 </div></main>;
}

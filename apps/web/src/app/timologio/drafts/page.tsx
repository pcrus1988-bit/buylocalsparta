import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalCsrfValue,fiscalMerchantAccounts,getFiscalActor} from "../../../lib/fiscal-auth";
import {FiscalConsoleDraftForm} from "../../../components/FiscalConsoleDraftForm";
import {listFiscalCounterparties} from "../../../lib/fiscal-counterparties";
import {fiscalInboxFilters,listFiscalMerchantInbox} from "../../../lib/fiscal-draft-inbox";
export const dynamic="force-dynamic";

const laneLabel:Record<string,string>={b2c:"B2C · Λιανική",pos:"POS",b2b:"B2B · Τιμολόγια",b2g:"B2G · Δημόσιο"};
const sourceLabel:Record<string,string>={console:"Κονσόλα",external_api:"Developer API",marketplace:"KONTA MOY"};
const dateLabel=(value:Date)=>new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
const moneyLabel=(value:string|null)=>{
 if(!value||!/^\d{1,13}$/.test(value))return "—";
 const minor=Number(value);
 return Number.isSafeInteger(minor)&&minor<=1e12
   ?new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100):"—";
};

export default async function FiscalDraftInbox({searchParams}:{
  searchParams:Promise<{organizationId?:string;lane?:string;source?:string;after?:string}>
}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [accounts,params,csrf]=await Promise.all([fiscalMerchantAccounts(actor),searchParams,fiscalCsrfValue()]);
 const account=params.organizationId?accounts.find(a=>a.id===params.organizationId):accounts[0];
 const filters=fiscalInboxFilters(params);
 const [inbox,counterparties]=account?await Promise.all([
  listFiscalMerchantInbox(actor,account.id,filters),listFiscalCounterparties(actor,account.id)
 ]):[{rows:[],nextCursor:null},[]];
 const nextParams=new URLSearchParams();
 if(account)nextParams.set("organizationId",account.id);
 if(filters.lane)nextParams.set("lane",filters.lane);
 if(filters.source)nextParams.set("source",filters.source);
 if(inbox.nextCursor)nextParams.set("after",inbox.nextCursor);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Οι επιχειρήσεις μου</Link><Link href="/timologio/counterparties">Αντισυμβαλλόμενοι</Link><Link href="/timologio/developers">Διασυνδέσεις</Link></nav>
  </header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Merchant workspace · Test records</div>
   <h1>Πρόχειρα παραστατικά</h1>
   <p>Ιστορικό δοκιμαστικών εγγραφών ανά επιχείρηση, με ασφαλή απομόνωση πρόσβασης και χωρίς μαζική φόρτωση.</p>
  </section>
  <section className="fiscal-panel">
   <p className="fiscal-alert" role="status"><strong>Μόνο δοκιμαστικά drafts.</strong> Οι εγγραφές αυτές δεν είναι αποδείξεις, τιμολόγια, παραστατικά myDATA ή νόμιμα εκδοθέντα φορολογικά στοιχεία. Δεν επιτρέπεται έκδοση, διαβίβαση ή χρήση τους ως επίσημων παραστατικών.</p>
   {accounts.length===0?<p>Δεν βρέθηκε επιχείρηση συνδεδεμένη με τον λογαριασμό σας.</p>:
    !account?<p role="alert">Δεν έχετε δικαίωμα πρόσβασης στην επιλεγμένη επιχείρηση.</p>:
    <>
     <form method="get" className="fiscal-form" style={{maxWidth:"100%",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",alignItems:"end"}}>
      <label>Επιχείρηση
       <select name="organizationId" defaultValue={account.id}>{accounts.map(a=><option key={a.id} value={a.id}>{a.legal_name} · {a.vat_number}</option>)}</select>
      </label>
      <label>Κατηγορία
       <select name="lane" defaultValue={filters.lane??""}><option value="">Όλες</option>
        {Object.entries(laneLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}
       </select>
      </label>
      <label>Πηγή
       <select name="source" defaultValue={filters.source??""}><option value="">Όλες</option>
        {Object.entries(sourceLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}
       </select>
      </label>
      <button type="submit" className="fiscal-button">Εφαρμογή φίλτρων</button>
     </form>
     {account.status==="approved"&&["owner","accountant"].includes(account.role)&&csrf
      ?<FiscalConsoleDraftForm key={account.id} organizationId={account.id} csrfToken={csrf} counterparties={counterparties}/>
      :<p className="fiscal-muted">Η δημιουργία δοκιμαστικών drafts διατίθεται μετά την έγκριση της επιχείρησης, σε ιδιοκτήτη ή εξουσιοδοτημένο λογιστή.</p>}
     <div className="fiscal-section">
      <h2>Εγγραφές · {account.legal_name}</h2>
      <p className="fiscal-muted">Εμφανίζονται έως 25 εγγραφές ανά σελίδα, με τις νεότερες πρώτες. Δεν προφορτώνονται όλα τα δεδομένα.</p>
      {inbox.rows.length===0?<p>Δεν υπάρχουν πρόχειρες εγγραφές για αυτά τα φίλτρα.</p>:
       <div style={{overflowX:"auto"}}>
        <table className="fiscal-table">
         <thead><tr><th scope="col">Ημερομηνία</th><th scope="col">Κατηγορία</th><th scope="col">Πηγή</th><th scope="col">Αναφορά</th><th scope="col">Ποσό</th><th scope="col">Κατάσταση</th></tr></thead>
         <tbody>{inbox.rows.map(row=><tr key={row.id}>
          <td>{dateLabel(row.created_at)}</td><td>{laneLabel[row.lane]??row.lane}</td>
          <td>{sourceLabel[row.source]??row.source}</td><td><Link href={"/timologio/drafts/"+encodeURIComponent(row.id)+"?organizationId="+encodeURIComponent(account.id)}>{row.reference||row.external_id||"Προβολή"}</Link></td>
          <td>{moneyLabel(row.gross_minor)}</td><td>Draft · Δεν εκδόθηκε</td>
         </tr>)}</tbody>
        </table>
       </div>}
      {inbox.nextCursor?<p><Link className="fiscal-button secondary" style={{color:"#10323c"}} href={"/timologio/drafts?"+nextParams.toString()}>Επόμενη σελίδα</Link></p>:null}
     </div>
    </>}
  </section>
 </div></main>;
}

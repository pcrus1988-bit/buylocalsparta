import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {fiscalMerchantAccounts,getFiscalActor} from "../../../../lib/fiscal-auth";
import {getFiscalMerchantDraft} from "../../../../lib/fiscal-draft-inbox";
export const dynamic="force-dynamic";

const lanes:Record<string,string>={b2c:"B2C · Λιανική",pos:"POS · Κατάστημα",b2b:"B2B · Επιχειρήσεις",b2g:"B2G · Δημόσιο"};
const sources:Record<string,string>={console:"FISCAL Console",external_api:"Test Developer API",marketplace:"KONTA MOY"};
export default async function FiscalDraftDetail({
 params,searchParams
}:{params:Promise<{id:string}>;searchParams:Promise<{organizationId?:string}>}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [{id},{organizationId},accounts]=await Promise.all([params,searchParams,fiscalMerchantAccounts(actor)]);
 const account=accounts.find(a=>a.id===organizationId);
 if(!account)notFound();
 const draft=await getFiscalMerchantDraft(actor,account.id,id);
 if(!draft)notFound();
 const date=new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"short"}).format(new Date(draft.created_at));
 const value=draft.gross_minor&&/^\d{1,13}$/.test(draft.gross_minor)&&Number(draft.gross_minor)<=1e12
  ?new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(Number(draft.gross_minor)/100):"—";
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href={"/timologio/drafts?organizationId="+encodeURIComponent(account.id)}>Πίσω στα drafts</Link><Link href="/timologio/dashboard">Η επιχείρησή μου</Link></nav>
  </header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Merchant workspace · Read-only</div>
   <h1>Προβολή δοκιμαστικού draft</h1>
   <p>Αναφορά: {draft.reference||draft.external_id||draft.id}</p>
  </section>
  <section className="fiscal-panel">
   <p className="fiscal-alert" role="status"><strong>Δεν είναι φορολογικό παραστατικό.</strong> Αυτή η εγγραφή δεν έχει εκδοθεί, υπογραφεί, αριθμηθεί ή διαβιβαστεί στην ΑΑΔΕ/myDATA. Δεν αποτελεί έγκυρη απόδειξη ή τιμολόγιο.</p>
   <h2>Στοιχεία δοκιμής</h2>
   <dl className="fiscal-draft-details">
    <div><dt>Επιχείρηση</dt><dd>{account.legal_name}</dd></div>
    <div><dt>ΑΦΜ</dt><dd>{account.vat_number}</dd></div>
    <div><dt>Κατηγορία</dt><dd>{lanes[draft.lane]??draft.lane}</dd></div>
    <div><dt>Πηγή</dt><dd>{sources[draft.source]??draft.source}</dd></div>
    <div><dt>Συνολικό δοκιμαστικό ποσό</dt><dd>{value}</dd></div>
    <div><dt>Αναφορά</dt><dd>{draft.reference||"—"}</dd></div>
    <div><dt>External ID</dt><dd>{draft.external_id||"—"}</dd></div>
    <div><dt>Καταχώριση</dt><dd>{date}</dd></div>
    <div><dt>Κατάσταση</dt><dd>Draft · Δεν εκδόθηκε</dd></div>
    <div><dt>Αναγνωριστικό draft</dt><dd><code>{draft.id}</code></dd></div>
   </dl>
   <p className="fiscal-muted">Οι εγγραφές είναι μόνο για δοκιμή διασυνδέσεων και ροών. Δεν υπάρχουν ενέργειες έκδοσης, αποστολής, διαγραφής ή μετατροπής σε επίσημο παραστατικό.</p>
  </section>
 </div></main>;
}

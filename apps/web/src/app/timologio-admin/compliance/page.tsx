import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalDatabaseConfigured,fiscalPool} from "../../../lib/fiscal-runtime";
export const dynamic="force-dynamic";
type Requirement={code:string;lane:string;title:string;description:string;state:string;regulator_approved:boolean};
const laneNames:Record<string,string>={core:"Shared Provider Core",b2c:"B2C · Retail",pos:"POS · All-in-One",b2b:"B2B · Invoicing",b2g:"B2G · Public Sector"};
export default async function FiscalCompliance(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 let controls:Requirement[]=[];
 let error="";
 if(!fiscalDatabaseConfigured())error="Η ανεξάρτητη βάση FISCAL δεν είναι συνδεδεμένη.";
 else try{
  const result=await fiscalPool().query<Requirement>(
   "SELECT code,lane,title,description,state,regulator_approved FROM fiscal_certification_controls ORDER BY lane,code LIMIT 100");
  controls=result.rows;
 }catch{error="Δεν είναι διαθέσιμος ο κατάλογος πιστοποίησης. Εφαρμόστε τις FISCAL migrations.";}
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · COMPLIANCE</span></Link>
   <nav><Link href="/timologio-admin">Control Centre</Link><Link href="/timologio">Public Service</Link></nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Provider certification program</div>
   <h1>Παράλληλοι έλεγχοι καταλληλότητας</h1>
   <p>Ενιαίο μητρώο απαιτήσεων με ανεξάρτητα προγράμματα B2C, POS, B2B και B2G. Εσωτερική τεχνική ετοιμότητα δεν αποτελεί άδεια ή έγκριση αρχής.</p></section>
  <section className="fiscal-panel"><h2>Κατάσταση προγράμματος</h2>
   {error?<p className="fiscal-alert" role="alert">{error}</p>:null}
   <div className="fiscal-grid">{Object.entries(laneNames).map(([lane,title])=>{
    const entries=controls.filter(c=>c.lane===lane);
    const reviewed=entries.filter(c=>c.state==="internal_evidence_reviewed").length;
    return <article key={lane} className="fiscal-card">
     <small>{lane==="core"?"SHARED":lane.toUpperCase()}</small><h3>{title}</h3>
     <p><strong>{entries.length} requirements</strong> · {reviewed} internal evidence reviewed</p>
     <p>Regulatory approval: <strong>Not granted</strong></p>
    </article>;
   })}</div>
  </section>
  <section className="fiscal-panel" style={{marginTop:20}}>
   {Object.entries(laneNames).map(([lane,title])=><section key={lane} className="fiscal-section">
    <h2>{title}</h2>
    <div className="fiscal-grid">{controls.filter(x=>x.lane===lane).map(control=><article key={control.code} className="fiscal-card">
     <small>{control.code} · {control.state.replaceAll("_"," ")}</small>
     <h3>{control.title}</h3><p>{control.description}</p>
    </article>)}</div>
   </section>)}
   <p className="fiscal-alert">Κανένα στοιχείο εδώ δεν εξουσιοδοτεί έκδοση φορολογικών παραστατικών. Απαιτούνται επίσημες πιστοποιήσεις, έλεγχοι και εξωτερική επαλήθευση.</p>
  </section></div></main>;
}

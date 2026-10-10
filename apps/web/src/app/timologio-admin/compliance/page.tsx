import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalDatabaseConfigured,fiscalPool} from "../../../lib/fiscal-runtime";
export const dynamic="force-dynamic";
type Requirement={code:string;lane:string;title:string;description:string;state:string;regulator_approved:boolean};
type RegulatorySource={code:string;topic:string;authority:string;title:string;source_url:string;
 research_note:string;evidence_state:string;evidence_sha256:string|null;source_version:string|null};
type TaxRuleCandidate={candidate_code:string;version:number;lane:string;rule_family:string;
 subject_code:string;proposed_rate_bps:number|null;valid_from:string;valid_until:string|null;
 source_code:string;state:string;fiscal_use_authorized:boolean};

const laneNames:Record<string,string>={core:"Shared Provider Core",b2c:"B2C · Retail",pos:"POS · All-in-One",b2b:"B2B · Invoicing",b2g:"B2G · Public Sector"};
export default async function FiscalCompliance(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 let controls:Requirement[]=[];
 let regulatorySources:RegulatorySource[]=[];
 let taxRuleCandidates:TaxRuleCandidate[]=[];
 let evidenceError="";
 let error="";
 if(!fiscalDatabaseConfigured())error="Η ανεξάρτητη βάση FISCAL δεν είναι συνδεδεμένη.";
 else try{
  const result=await fiscalPool().query<Requirement>(
   "SELECT code,lane,title,description,state,regulator_approved FROM fiscal_certification_controls ORDER BY lane,code LIMIT 100");
  controls=result.rows;
 }catch{error="Δεν είναι διαθέσιμος ο κατάλογος πιστοποίησης. Εφαρμόστε τις FISCAL migrations.";}
 if(fiscalDatabaseConfigured())try{
  const [sources,candidates]=await Promise.all([
   fiscalPool().query<RegulatorySource>(
    "SELECT code,topic,authority,title,source_url,research_note,evidence_state,evidence_sha256,source_version FROM fiscal_regulatory_sources ORDER BY authority,code LIMIT 50"),
   fiscalPool().query<TaxRuleCandidate>(
    "SELECT candidate_code,version,lane,rule_family,subject_code,proposed_rate_bps,valid_from::text,valid_until::text,source_code,state,fiscal_use_authorized FROM fiscal_tax_rule_candidates ORDER BY created_at DESC LIMIT 25")
  ]);
  regulatorySources=sources.rows;
  taxRuleCandidates=candidates.rows;
 }catch{evidenceError="Το μητρώο τεκμηρίωσης δεν είναι διαθέσιμο. Απαιτείται η ανεξάρτητη migration 0011.";}
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
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <h2>Επίσημες πηγές — μητρώο έρευνας</h2>
   <p className="fiscal-muted">Σύνδεσμοι αναφοράς από ΑΑΔΕ και Ευρωπαϊκή Επιτροπή. Κανένα έγγραφο δεν έχει ακόμη αρχειοθετηθεί με SHA-256 ούτε έχει επικυρωθεί η εφαρμογή συγκεκριμένου φορολογικού κανόνα. Οι ημερομηνίες ισχύος, η συναλλαγή και τα ειδικά καθεστώτα απαιτούν χωριστή τεκμηρίωση.</p>
   {evidenceError?<p className="fiscal-alert" role="alert">{evidenceError}</p>:null}
   <div className="fiscal-grid">{regulatorySources.map(source=><article className="fiscal-card" key={source.code}>
    <small>{source.authority.toUpperCase()} · {source.topic} · {source.evidence_state.replaceAll("_"," ")}</small>
    <h3>{source.title}</h3>
    <p><Link href={source.source_url} target="_blank" rel="noopener noreferrer">Επίσημη πηγή ↗</Link></p>
    <p className="fiscal-muted">{source.research_note}</p>
    <small>Evidence snapshot: {source.evidence_sha256?"Recorded; independent review pending":"Not archived"}</small>
   </article>)}</div>
   {regulatorySources.length===0?<p className="fiscal-muted">Δεν έχουν φορτωθεί πηγές ή δεν είναι διαθέσιμη η ανεξάρτητη FISCAL βάση.</p>:null}
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <h2>Υποψήφιοι φορολογικοί κανόνες — μη ενεργοί</h2>
   <p className="fiscal-alert"><strong>Απαγορεύεται η χρήση για έκδοση.</strong> Η εσωτερική έρευνα δεν παρέχει έγκριση λογιστή, ΑΑΔΕ, παρόχου ή δημόσιας αρχής. Καμία πρόταση κανόνα δεν τροφοδοτεί το FISCAL calculator, το myDATA, POS, ERP ή το marketplace.</p>
   <p>{taxRuleCandidates.length} υποψήφιοι κανόνες (τελευταίοι 25). Κατάσταση: research only · δημοσιονομική χρήση: OFF.</p>
   {taxRuleCandidates.length>0?<div style={{overflowX:"auto"}}><table className="fiscal-table">
    <thead><tr><th>Κωδικός / έκδοση</th><th>Κλάδος</th><th>Οικογένεια</th><th>Πεδίο</th><th>Ημερομηνίες</th><th>Χρήση</th></tr></thead>
    <tbody>{taxRuleCandidates.map(rule=><tr key={rule.candidate_code+":"+rule.version}>
     <td>{rule.candidate_code} · v{rule.version}</td><td>{rule.lane.toUpperCase()}</td>
     <td>{rule.rule_family}</td><td>{rule.subject_code}</td>
     <td>{rule.valid_from} – {rule.valid_until??"αόριστο"}</td><td>Research only</td>
    </tr>)}</tbody>
   </table></div>:<p className="fiscal-muted">Δεν έχουν καταχωριστεί υποψήφιοι κανόνες. Η εφαρμογή συντελεστών δεν πραγματοποιείται αυτόματα.</p>}
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

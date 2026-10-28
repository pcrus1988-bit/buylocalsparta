import type {Metadata} from "next";
import Link from "next/link";
import {maziPublicFundTally} from "../../../lib/mazi-api";
import {euroCents} from "../../../lib/fund-transparency";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Αποτελέσματα Αναπτυξιακού Ταμείου · ΜΑΖΙ",
 description:"Οριστικοποιημένα αποτελέσματα των πραγματικών ψηφοφοριών, κανόνες, απαρτία και ψήφοι ανά αναπτυξιακό έργο."};
export default async function FundResults(){
 const r=await maziPublicFundTally();
 const quorum=r?.finalized&&typeof r.valid_ballots==="number"&&typeof r.electorate_count==="number"&&
   typeof r.quorum_percent==="number"&&r.electorate_count>0&&
   r.valid_ballots*100>=r.electorate_count*r.quorum_percent;
 const turnout=r?.finalized&&r.electorate_count?100*(r.valid_ballots||0)/r.electorate_count:0;
 return <main id="content" style={{background:"#f5f3ed",color:"#153b2d",minHeight:"100vh"}}>
  <header style={{background:"#14382e",color:"#fff",padding:"82px max(24px,calc((100vw - 1100px)/2))"}}>
   <span style={{fontSize:12,letterSpacing:".17em",color:"#bed6c1"}}>ΜΑΖΙ / ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ / ΔΙΑΚΥΒΕΡΝΗΣΗ</span>
   <h1 style={{fontSize:"clamp(48px,6.5vw,80px)",letterSpacing:"-.07em",lineHeight:1.08,margin:"20px 0"}}>Οι αποφάσεις μας.<br/><em style={{fontFamily:"Georgia,serif",color:"#eab99c",fontWeight:400}}>Με ανοιχτά αποτελέσματα.</em></h1>
   <p style={{maxWidth:750,lineHeight:1.75,fontSize:18}}>Όταν ένας χρηματοδοτικός κύκλος ολοκληρώνεται, οι ψήφοι και οι προδημοσιευμένοι κανόνες του αποτυπώνονται δημόσια. Οι επιλογές συγκεκριμένων μελών παραμένουν ιδιωτικές.</p>
   <Link href="/fund/transparency" style={{color:"#e8ba9f"}}>← Οικονομική διαφάνεια</Link>
  </header>
  <div style={{maxWidth:1100,margin:"0 auto",padding:"55px 24px 110px"}}>
  {!r?<section role="alert" style={{padding:32,background:"#fff"}}>
   <h2>Δεν είναι διαθέσιμα επαληθευμένα αποτελέσματα</h2>
   <p>Η υπηρεσία δεν μπορεί να ανακτηθεί. Αυτό δεν υποδηλώνει ότι η ψηφοφορία είχε μηδενική συμμετοχή.</p>
  </section>:!r.finalized?<section style={{background:"#fff",padding:32,border:"1px solid #d0dccf"}}>
   <span style={{fontSize:12,letterSpacing:".13em",color:"#68836c"}}>ΧΩΡΙΣ ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΟ ΧΡΗΜΑΤΟΔΟΤΙΚΟ ΚΥΚΛΟ</span>
   <h2 style={{fontSize:32,letterSpacing:"-.05em",margin:"16px 0"}}>Δεν έχουν ακόμη δημοσιευτεί χρηματοδοτικά αποτελέσματα.</h2>
   <p style={{lineHeight:1.8}}>Ο ιδρυτικός κύκλος καταγραφής αναγκών δεν μοιράζει χρήματα. Η δημοσίευση ξεκινά μόνο μετά από πραγματική ψηφοφορία, επίσημη οριστικοποίηση και καταγραφή του εκλογικού σώματος.</p>
   <Link href="/proposals" style={{textDecoration:"underline"}}>Τρέχουσες ανάγκες μελών →</Link>
  </section>:<>
   <span style={{fontSize:12,letterSpacing:".17em",color:"#698471"}}>ΟΡΙΣΤΙΚΑ ΑΠΟΤΕΛΕΣΜΑΤΑ · {new Date(r.finalized_at!).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}</span>
   <h2 style={{fontSize:42,letterSpacing:"-.05em",margin:"15px 0"}}>{r.title}</h2>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(215px,1fr))",gap:12,margin:"35px 0"}}>
    {[
     ["Επαληθευμένες επιχειρήσεις",String(r.electorate_count)],
     ["Έγκυρα ψηφοδέλτια",String(r.valid_ballots)],
     ["Ακυρωμένα ψηφοδέλτια",String(r.invalidated_ballots)],
     ["Συμμετοχή",turnout.toLocaleString("el-GR",{maximumFractionDigits:1})+"%"],
     ["Απαρτία",quorum?"Επετεύχθη":"Δεν επετεύχθη"]
    ].map(([label,value])=><div key={label} style={{background:"#fff",padding:25,border:"1px solid #d7e0d6"}}>
      <span style={{fontSize:12,color:"#617965"}}>{label}</span>
      <strong style={{fontSize:29,display:"block",marginTop:15,letterSpacing:"-.04em"}}>{value}</strong>
     </div>)}
   </div>
   <section style={{padding:27,background:"#e7ecdf",lineHeight:1.8}}>
    <h3 style={{margin:"0 0 10px",fontSize:23}}>Οι όροι της συγκεκριμένης ψηφοφορίας</h3>
    <p style={{margin:0}}>Προϋπολογισμός κύκλου: <strong>{euroCents(r.funding_budget_cents!)}</strong> · Ελάχιστο ποσοστό απαρτίας: <strong>{r.quorum_percent}%</strong> · Ελάχιστες ψήφοι ανά πρόταση: <strong>{r.minimum_support_votes}</strong> · Ανώτατος αριθμός έργων: <strong>{r.max_awards}</strong> · Ανώτατη ενίσχυση ανά έργο: <strong>{euroCents(r.project_cap_cents!)}</strong>.</p>
    <p style={{overflowWrap:"anywhere",fontSize:13}}>Αμετάβλητο SHA-256 δημοσιευμένου κανονισμού: <code>{r.rules_sha256}</code> · Έκδοση κατανομής: {r.policy_version}</p>
   </section>
   <section style={{marginTop:60}}>
    <span style={{letterSpacing:".16em",fontSize:12,color:"#678371"}}>ΠΡΟΤΑΣΕΙΣ / ΕΓΚΥΡΗ ΣΤΗΡΙΞΗ</span>
    <h2 style={{fontSize:35,letterSpacing:"-.05em"}}>Η επιλογή των μελών</h2>
    <p style={{lineHeight:1.75}}>Μία επιχείρηση μπορούσε να υποστηρίξει περισσότερα από ένα έργα με ένα ψηφοδέλτιο. Επομένως το άθροισμα των ψήφων στήριξης ανά πρόταση μπορεί να υπερβαίνει τον αριθμό ψηφοδελτίων.</p>
    {!r.proposals?.length?<p>Δεν υπάρχουν εγκεκριμένες προτάσεις με δημοσιευμένη καταμέτρηση.</p>:
     <div style={{display:"grid",gap:12}}>{r.proposals.map((p,i)=><article key={p.id} style={{padding:26,background:"#fff",border:"1px solid #d8e1d8"}}>
      <span style={{fontSize:12,color:"#78927d"}}>{String(i+1).padStart(2,"0")} · {p.first_time_support_request?"ΠΡΩΤΗ ΑΙΤΗΣΗ":"ΕΠΑΝΑΛΗΠΤΙΚΗ ΑΙΤΗΣΗ"}</span>
      <div style={{display:"flex",gap:18,justifyContent:"space-between",alignItems:"start",flexWrap:"wrap",margin:"15px 0"}}>
       <h3 style={{fontSize:24,letterSpacing:"-.03em",margin:0}}>{p.title}</h3>
       <strong style={{fontSize:26}}>{p.supporting_ballots} ψήφοι</strong>
      </div>
      <div style={{background:"#e9eee7",height:8,borderRadius:5,overflow:"hidden"}}>
       <div style={{background:"#3b7756",height:"100%",width:${Math.min(100,p.supporting_ballots/Math.max(1,r.valid_ballots!)*100)}+"%"}}/>
      </div>
      <p style={{fontSize:14,color:"#62776a"}}>Αιτούμενα: {euroCents(p.amount_cents)} · Ελάχιστο χρήσιμο: {euroCents(p.minimum_useful_cents)}</p>
     </article>)}</div>}
   </section>
   <section style={{paddingTop:32,marginTop:54,borderTop:"1px solid #bcd0bb",lineHeight:1.75}}>
    <h2 style={{fontSize:28}}>Από την ψήφο στην πραγματική ενίσχυση</h2>
    <p>Η κατάταξη και η συμμετοχή δεν ισοδυναμούν με εκταμίευση ή νόμιμη υποχρέωση. Η εκάστοτε οικονομική κατανομή απαιτεί ξεχωριστή τεκμηρίωση, ενεργό και διαθέσιμο κεφάλαιο, ελεγμένη προσφορά, αποδεκτή σύμβαση και πραγματική έγκριση πληρωμής.</p>
    <Link href="/fund/transparency" style={{textDecoration:"underline"}}>Δείτε τις πραγματικές οικονομικές κινήσεις →</Link>
   </section>
  </>}
  </div>
 </main>;
}

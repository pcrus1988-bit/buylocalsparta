import type {Metadata} from "next";
import Link from "next/link";
import {maziPublicFundReport} from "../../../lib/mazi-api";
import {euroCents,financeStatus} from "../../../lib/fund-transparency";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Διαφάνεια Αναπτυξιακού Ταμείου · ΜΑΖΙ",
 description:"Δημόσιος απολογισμός πραγματικών εισροών, εξόδων, δεσμεύσεων, συμφωνιών και ελεγχόμενων δημοσιεύσεων."};
const names:Record<string,string>={
 receipt:"Εισροή",award:"Απόφαση ενίσχυσης",disbursement:"Εκταμίευση",
 expense:"Έξοδο",reconciliation:"Συμφωνία",correction:"Διόρθωση",milestone:"Ορόσημο έργου"
};
export default async function FundTransparency(){
 const r=await maziPublicFundReport();
 return <main id="content" style={{background:"#f5f4ee",color:"#15362c",minHeight:"100vh"}}>
  <section style={{background:"#13372e",padding:"90px max(25px,calc((100vw - 1120px)/2)) 86px",color:"#f8f7ee"}}>
   <span style={{textTransform:"uppercase",letterSpacing:".18em",fontSize:12,color:"#bedac2",fontWeight:700}}>ΜΑΖΙ / ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ / 01</span>
   <h1 style={{fontSize:"clamp(46px,7vw,94px)",letterSpacing:"-.065em",margin:"22px 0 24px",lineHeight:1}}>Κάθε ευρώ.<br/><em style={{color:"#e9ac8f",fontFamily:"Georgia,serif",fontWeight:400}}>Ανοιχτά στοιχεία.</em></h1>
   <p style={{fontSize:18,maxWidth:750,lineHeight:1.7,color:"#dfebe0"}}>Οι αποφάσεις της κοινότητας και η οικονομική κατάσταση του Ταμείου οφείλουν να είναι ορατές και επαληθεύσιμες. Δημοσιεύουμε χωριστά όσα καταγράφηκαν, όσα δεσμεύθηκαν και όσα πράγματι εκταμιεύθηκαν.</p>
   <Link href="/fund" style={{color:"#eac0a5",display:"inline-block",marginTop:30}}>← Επιστροφή στο Ταμείο</Link>
  </section>
  <div style={{maxWidth:1120,margin:"0 auto",padding:"45px 24px 100px"}}>
   {!r?<section role="alert" style={{padding:32,border:"1px solid #b6c9b9",background:"#fff"}}>
     <h2 style={{fontSize:28}}>Τα οικονομικά στοιχεία δεν είναι διαθέσιμα</h2>
     <p>Δεν εμφανίζουμε μηδενικά ποσά όταν η ζωντανή σύνδεση δεν μπορεί να επαληθευτεί. Καμία τιμή σε αυτή τη σελίδα δεν πρέπει να θεωρείται επίσημο υπόλοιπο έως την αποκατάσταση της υπηρεσίας.</p>
    </section>:<>
   <section style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:18,flexWrap:"wrap"}}>
     <div><span style={{fontSize:12,letterSpacing:".13em",fontWeight:700}}>ΚΑΤΑΣΤΑΣΗ ΛΕΙΤΟΥΡΓΙΑΣ</span>
       <h2 style={{fontSize:30,letterSpacing:"-.04em",margin:"11px 0"}}>{r.financial_operations_enabled?"Οικονομική λειτουργία ενεργή":"Οικονομική λειτουργία ανενεργή"}</h2>
       <p style={{maxWidth:750,lineHeight:1.6}}>{financeStatus(r)}</p></div>
     <div style={{fontSize:12,color:"#5e7469"}}>Ενημέρωση δεδομένων: <time dateTime={r.as_of}>{new Date(r.as_of).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</time></div>
   </section>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,margin:"34px 0"}}>
     {[
       ["Εγγεγραμμένες εισροές",euroCents(r.receipts_cents)],
       ["Καταχωρισμένες εκροές",euroCents(r.expenses_cents)],
       ["Λογιστικό υπόλοιπο",euroCents(r.book_cash_balance_cents)],
       ["Προσφορές υπό δέσμευση",euroCents(r.reserved_offers_cents)],
       ["Διαθέσιμο προς κατανομή",r.available_for_new_awards_cents===null?"Μη επαληθευμένο":euroCents(r.available_for_new_awards_cents)]
     ].map(([label,value])=><div key={label} style={{padding:24,background:"#fff",border:"1px solid #d9e2d9",minHeight:128}}>
       <span style={{fontSize:12,color:"#557263"}}>{label}</span><strong style={{fontSize:24,display:"block",marginTop:14,letterSpacing:"-.04em",overflowWrap:"anywhere"}}>{value}</strong>
     </div>)}
   </div>
   <p style={{lineHeight:1.7,padding:"18px 22px",borderLeft:"3px solid #ddaa87",background:"#eeeae1"}}>
     <strong>Πώς διαβάζονται τα ποσά:</strong> Το λογιστικό υπόλοιπο ισούται με τις καταχωρισμένες εισροές μείον τα καταχωρισμένα έξοδα. Δεν αποδεικνύει τραπεζικό υπόλοιπο. Οι προσφορές ενίσχυσης δεν είναι εκταμιεύσεις. Τα ποσά «κατανομής» καταγράφονται ξεχωριστά ώστε να μην υπολογίζονται δύο φορές.
   </p>
   <section style={{marginTop:65}}>
     <span style={{fontSize:12,letterSpacing:".16em",fontWeight:700}}>02 / ΧΡΗΜΑΤΟΟΙΚΟΝΟΜΙΚΗ ΣΥΜΦΩΝΙΑ</span>
     <h2 style={{fontSize:35,letterSpacing:"-.04em",margin:"14px 0"}}>Τι μπορεί να επαληθευτεί;</h2>
     {r.reconciliation?<div style={{padding:25,background:"#fff"}}>
      <p>Τελευταία καταγεγραμμένη εσωτερική συμφωνία: {r.reconciliation.period_end}</p>
      <strong style={{fontSize:23}}>{euroCents(r.reconciliation.statement_balance_cents)}</strong>
      <p style={{lineHeight:1.6}}>Συμφωνία βιβλίου με δηλωμένη τραπεζική κατάσταση. Αυτό δεν υποκαθιστά ανεξάρτητο οικονομικό έλεγχο.</p>
     </div>:<div style={{padding:25,background:"#fff"}}>
      <strong>Δεν έχει καταχωριστεί συμφωνία με τραπεζική κατάσταση.</strong>
      <p>Καμία μη επαληθευμένη τραπεζική απαίτηση δεν εμφανίζεται ως διαθέσιμο κεφάλαιο.</p>
     </div>}
     {r.reversal_entries_cents>0?<p role="alert">Υπάρχουν εγγραφές αντιλογισμού συνολικού ύψους {euroCents(r.reversal_entries_cents)} που χρειάζονται συμφωνία πριν από νέα κατανομή.</p>:null}
     <p style={{fontSize:13,color:"#52675a"}}>Καταχωρίσεις καθολικού: {r.ledger_entries} · Καταχωρισμένες αποφάσεις κατανομής: {euroCents(r.allocation_entries_cents)} · Μελλοντικές προσφορές: {r.offer_count}</p>
   </section>
   <section style={{marginTop:65}}>
     <span style={{fontSize:12,letterSpacing:".16em",fontWeight:700}}>03 / ΙΣΤΟΡΙΚΟ ΣΥΝΑΛΛΑΓΩΝ</span>
     <h2 style={{fontSize:35,letterSpacing:"-.04em",margin:"14px 0"}}>Δημοσιευμένες εγγραφές</h2>
     <p style={{lineHeight:1.65}}>Προβάλλονται μόνο καταχωρίσεις που έχουν ελεγχθεί και αποπροσωποποιηθεί. Οι πλήρεις πληροφορίες πληρωμών και τα τραπεζικά παραστατικά διατηρούνται σε προστατευμένο αρχείο.</p>
     {!r.public_events.length?<div style={{padding:26,background:"#fff"}}>Δεν υπάρχουν ακόμη ελεγμένες δημόσιες οικονομικές εγγραφές ή εκταμιεύσεις.</div>:
      <div style={{display:"grid",gap:8}}>{r.public_events.map(e=><article key={e.id} style={{background:"#fff",padding:23,border:"1px solid #d7e0d7"}}>
       <div style={{display:"flex",justifyContent:"space-between",gap:15,flexWrap:"wrap"}}><span style={{fontSize:12,color:"#617a69"}}>{e.date} · {names[e.kind]||e.kind}</span>
        <strong>{e.amount_cents===null?"Χωρίς ποσό":euroCents(e.amount_cents)}</strong></div>
       <p style={{lineHeight:1.6,marginTop:12}}>{e.summary}</p>
       {e.evidence_sha256?<small style={{overflowWrap:"anywhere",display:"block"}}>Αποτύπωμα αποδεικτικού SHA-256: {e.evidence_sha256}</small>:null}
       {e.supersedes_id?<small>Διορθώνει προηγούμενη δημοσίευση {e.supersedes_id}</small>:null}
      </article>)}</div>}
   </section>
   <section style={{marginTop:65}}>
     <span style={{fontSize:12,letterSpacing:".16em",fontWeight:700}}>04 / ΧΡΟΝΙΚΗ ΕΞΕΛΙΞΗ</span>
     <h2 style={{fontSize:35,letterSpacing:"-.04em",margin:"14px 0"}}>Ανά μήνα</h2>
     {!r.monthly.length?<p>Δεν υπάρχουν ακόμη μηνιαίες οικονομικές κινήσεις.</p>:
      <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",minWidth:570}}>
      <thead><tr>{["Μήνας","Εισροές","Έξοδα","Κατανομές"].map(x=><th key={x} scope="col" style={{textAlign:"left",borderBottom:"2px solid #183e30",padding:14}}>{x}</th>)}</tr></thead>
      <tbody>{r.monthly.map(x=><tr key={x.month}><th scope="row" style={{textAlign:"left",padding:14,borderBottom:"1px solid #d0d8cf"}}>{x.month}</th>
       {[x.receipts_cents,x.expenses_cents,x.allocations_cents].map((v,i)=><td key={i} style={{padding:14,borderBottom:"1px solid #d0d8cf"}}>{euroCents(v)}</td>)}</tr>)}</tbody>
      </table></div>}
   </section>
   <section style={{marginTop:65,borderTop:"1px solid #becdbb",paddingTop:26,fontSize:14,lineHeight:1.7}}>
    <h2 style={{fontSize:26}}>Κανόνες λογοδοσίας</h2>
    <p>Όλες οι αλλαγές σε οικονομικά τεκμήρια δημοσιεύονται ως νέες διορθωτικές εγγραφές και όχι με σιωπηρή αντικατάσταση του ιστορικού. Η απογραφή των πραγματικών ποσών δεν επιτρέπει από μόνη της εκταμιεύσεις· απαιτούνται νόμιμη ενεργοποίηση, επαληθεύσεις, συμφωνίες, συμβάσεις και τεκμηρίωση δαπανών.</p>
    <p><Link href="/fund/procedures" style={{textDecoration:"underline"}}>Διαδικασία ψήφων, ενισχύσεων και ελέγχου →</Link> · <Link href="/fund/results" style={{textDecoration:"underline"}}>Οριστικά αποτελέσματα ψηφοφοριών →</Link></p>
   </section>
   </>}
  </div>
 </main>;
}

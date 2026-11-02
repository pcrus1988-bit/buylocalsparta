import Link from "next/link";
import {maziPublicFundProjectUpdates} from "../../../lib/mazi-api";
import {euroCents} from "../../../lib/fund-transparency";
export const dynamic="force-dynamic";
export const metadata={title:"Έργα και τεκμηριωμένη πρόοδος · ΜΑΖΙ",
 description:"Αμετάβλητες αναφορές προόδου των πραγματικά αποδεκτών ενισχύσεων του Αναπτυξιακού Ταμείου ΜΑΖΙ."};
const title:Record<string,string>={
 milestone:"Ορόσημο υλοποίησης",
 evidence_verified:"Επαληθευμένο τεκμήριο",
 completion:"Τεκμηριωμένη ολοκλήρωση",
 correction:"Διορθωτική δημοσίευση"
};
export default async function MaziFundProjects(){
 const updates=await maziPublicFundProjectUpdates();
 const groups=updates?Array.from(new Set(updates.map(x=>x.offer_id))).map(id=>({
  id,items:updates.filter(x=>x.offer_id===id)})):[];
 return <main style={{minHeight:"100vh",background:"#f4f5ee",color:"#153c2b"}}>
  <header style={{background:"#173f33",color:"#fff",padding:"82px max(24px,calc((100vw - 1110px)/2))"}}>
   <span style={{fontSize:12,letterSpacing:".17em",color:"#afd2bb"}}>ΜΑΖΙ · ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ · ΕΠΟΠΤΕΙΑ ΕΡΓΩΝ</span>
   <h1 style={{fontSize:"clamp(45px,7vw,81px)",letterSpacing:"-.065em",lineHeight:1.05,margin:"20px 0"}}>
    Μετράμε την <em style={{fontFamily:"Georgia,serif",fontWeight:400,color:"#efc5a3"}}>πραγματική πρόοδο.</em></h1>
   <p style={{fontSize:18,lineHeight:1.7,maxWidth:730}}>Η απόφαση στήριξης δεν είναι το τέλος της ιστορίας. Εδώ δημοσιεύονται ελεγμένες ενημερώσεις για έργα που έχουν πραγματικά αποδεχτεί την προσφορά ενίσχυσης — με ημερομηνίες, τεκμήρια και διαχρονικό ιστορικό διορθώσεων.</p>
   <nav style={{display:"flex",flexWrap:"wrap",gap:22,marginTop:25}}>
    <Link style={{color:"#f0c5a3"}} href="/fund/transparency">Οικονομικός απολογισμός →</Link>
    <Link style={{color:"#f0c5a3"}} href="/fund/results">Αποτελέσματα ψηφοφοριών →</Link>
   </nav>
  </header>
  <section style={{maxWidth:1110,margin:"auto",padding:"57px 24px 100px"}}>
   <span style={{fontSize:12,letterSpacing:".14em",color:"#65826b"}}>ΕΠΑΛΗΘΕΥΜΕΝΗ ΔΗΜΟΣΙΑ ΛΟΓΟΔΟΣΙΑ</span>
   <h2 style={{fontSize:38,letterSpacing:"-.045em",margin:"15px 0 21px"}}>Το χρονολόγιο των έργων</h2>
   {updates===null?<div role="alert" style={{background:"#fff",padding:32,border:"1px solid #dfdfd4"}}>
    <h3>Δεν είναι διαθέσιμη επαληθευμένη εικόνα προόδου</h3>
    <p>Η υπηρεσία δεδομένων δεν ανταποκρίνεται. Δεν συνάγουμε ότι έχουν μηδενιστεί οι αναφορές.</p>
   </div>:groups.length===0?<div style={{background:"#fff",padding:32,border:"1px solid #dfdfd4"}}>
    <h3 style={{fontSize:26,letterSpacing:"-.02em"}}>Δεν έχουν ακόμη δημοσιευτεί αποδεδειγμένα ορόσημα.</h3>
    <p style={{lineHeight:1.8,maxWidth:740}}>Η αρχική μη χρηματοδοτική περίοδος δεν περιλαμβάνει ενισχύσεις. Μία αναφορά προόδου προϋποθέτει πραγματική προσφορά, ρητή αποδοχή της σύμβασης και διοικητικό έλεγχο των δημόσιων πληροφοριών.</p>
   </div>:<div style={{display:"grid",gap:27}}>
    {groups.map(g=><article key={g.id} style={{background:"#fff",padding:"clamp(22px,4vw,40px)",border:"1px solid #d1ddce"}}>
     <span style={{fontSize:12,color:"#617b6b",letterSpacing:".09em"}}>{g.items[0].cycle_slug} · ΑΠΟΔΕΚΤΗ ΠΡΟΣΦΟΡΑ</span>
     <h3 style={{fontSize:29,letterSpacing:"-.045em",margin:"15px 0 12px"}}>{g.items[0].proposal_title}</h3>
     <p style={{fontSize:15,color:"#5c7261"}}>Ποσό προσφοράς: <strong>{euroCents(g.items[0].assigned_amount_cents)}</strong>. Πρόκειται για συμβατική προσφορά, όχι για βεβαιωμένη εκταμίευση.</p>
     <div style={{borderLeft:"2px solid #b6cbb7",marginTop:28,paddingLeft:24,display:"grid",gap:25}}>
      {g.items.map(e=><div key={e.id}>
       <span style={{fontSize:12,color:"#65836c"}}>{new Date(e.published_at).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})} · {title[e.update_kind]}</span>
       <p style={{lineHeight:1.8,margin:"9px 0"}}>{e.summary}</p>
       {e.evidence_sha256?<p style={{fontSize:12,overflowWrap:"anywhere",color:"#586f61"}}>Αποτύπωμα SHA-256 ελεγμένου αποδεικτικού: <code>{e.evidence_sha256}</code></p>:null}
       {e.supersedes_id?<p style={{fontSize:12,color:"#985a48"}}>Διορθώνει προηγούμενη δημοσίευση #{e.supersedes_id.slice(0,8)} χωρίς τη διαγραφή της.</p>:null}
      </div>)}
     </div>
    </article>)}
   </div>}
   <aside style={{borderTop:"1px solid #c1d1c0",marginTop:55,paddingTop:27,lineHeight:1.8}}>
    <h3 style={{fontSize:25}}>Τι αποδεικνύει και τι δεν αποδεικνύει αυτό το αρχείο</h3>
    <p>Κάθε εγγραφή προόδου ελέγχεται διοικητικά και διατηρείται ως ιστορικό γεγονός. Το SHA-256 επιτρέπει αντιπαραβολή ενός διαθέσιμου αποδεικτικού χωρίς να αποκαλύπτει προστατευμένα έγγραφα, οικονομικούς λογαριασμούς ή προσωπικές πληροφορίες. Η καταχώριση δεν αποτελεί από μόνη της ανεξάρτητη πιστοποίηση ή τραπεζική βεβαίωση.</p>
    <p>Οι πραγματικές εισροές, δεσμεύσεις και εκταμιεύσεις παρακολουθούνται χωριστά στον <Link href="/fund/transparency" style={{textDecoration:"underline"}}>δημόσιο οικονομικό απολογισμό</Link>.</p>
   </aside>
  </section>
 </main>;
}

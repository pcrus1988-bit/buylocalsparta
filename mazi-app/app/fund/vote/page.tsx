import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziFundMemberRequest,type MaziFundBallotState} from "../../../lib/mazi-api";
import {castMaziFundBallot} from "../../actions";
import {euroCents} from "../../../lib/fund-transparency";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ψηφοφορία Αναπτυξιακού Ταμείου · ΜΑΖΙ",
 robots:{index:false,follow:false}};
const notices:Record<string,string>={
 voted:"Το ψηφοδέλτιό σου καταχωρίστηκε οριστικά για τη συγκεκριμένη επιχείρηση. Δεν μπορεί να αντικατασταθεί.",
 already_voted:"Η επιχείρησή σου έχει ήδη ψηφίσει σε αυτόν τον κύκλο.",
 invalid_choices:"Επίλεξε μία ή περισσότερες επιτρεπόμενες προτάσεις.",
 voting_not_open:"Η ψηφοφορία δεν είναι ανοιχτή ή η επιχείρησή σου δεν διαθέτει δικαίωμα ψήφου.",
 ballot_not_eligible:"Η καταχώριση δεν επιτράπηκε. Ενδέχεται να υπάρχει σύγκρουση συμφερόντων ή η πρόταση να μην είναι πλέον επιλέξιμη.",
 service_unavailable:"Δεν κατέστη δυνατή η ασφαλής καταχώριση της ψήφου."
};
const date=(s:string)=>new Date(s).toLocaleString("el-GR",{timeZone:"Europe/Athens"});
export default async function MaziFundVote({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziFundMemberRequest<MaziFundBallotState>("state");
 if(!result.ok&&result.error==="membership_required")redirect("/members");
 const params=await searchParams;
 return <main id="content" style={{minHeight:"100vh",background:"#f4f2e9",color:"#14392d"}}>
  <header style={{background:"#153c31",color:"#fff",padding:"78px max(24px,calc((100vw - 1080px)/2)) 70px"}}>
   <span style={{fontSize:12,letterSpacing:".17em",color:"#bcd1c4"}}>ΜΑΖΙ / ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ / ΜΕΛΟΣ</span>
   <h1 style={{fontSize:"clamp(40px,7vw,80px)",lineHeight:1.05,letterSpacing:"-.065em",margin:"20px 0"}}>Η ψήφος σου.<br/><em style={{fontFamily:"Georgia,serif",color:"#ecb296",fontWeight:400}}>Το κοινό μας αύριο.</em></h1>
   <p style={{maxWidth:720,fontSize:18,lineHeight:1.7}}>Επίλεξε περισσότερα από ένα έργα στον ίδιο χρηματοδοτικό κύκλο. Κάθε επαληθευμένη επιχείρηση ψηφίζει μία φορά, ανεξάρτητα από το μέγεθος της συνδρομής της.</p>
   <Link href="/dashboard" style={{color:"#eabb9f",display:"inline-block",marginTop:22}}>← Η επιχείρησή μου</Link>
  </header>
  <section style={{maxWidth:1080,margin:"0 auto",padding:"50px 24px 110px"}}>
   {params.notice&&notices[params.notice]?<p role="status" style={{background:"#fff",padding:20,border:"1px solid #b4c6b8"}}>{notices[params.notice]}</p>:null}
   {!result.ok?<div role="alert" style={{background:"#fff",padding:32}}>
    <h2>Η ψηφοφορία δεν είναι διαθέσιμη</h2><p>Δεν εμφανίζονται μη επαληθευμένα στοιχεία και δεν έγινε καμία καταχώριση.</p>
   </div>:!result.cycle?<div style={{background:"#fff",padding:36,border:"1px solid #d1ddcf"}}>
    <span style={{fontSize:12,color:"#789680",letterSpacing:".13em"}}>FINANCIAL ACTIVITY OFF</span>
    <h2 style={{fontSize:32,margin:"16px 0",letterSpacing:"-.04em"}}>Δεν υπάρχει ενεργός χρηματοδοτικός κύκλος.</h2>
    <p style={{lineHeight:1.8}}>Ο ιδρυτικός κύκλος καταγράφει πραγματικές ανάγκες χωρίς χρηματοδότηση. Η συμμετοχή σου σε αυτόν παραμένει διαθέσιμη στη σελίδα των προτάσεων. Νέα χρηματοδοτική ψηφοφορία απαιτεί προηγούμενη νόμιμη και οικονομική ενεργοποίηση.</p>
    <Link href="/proposals" style={{textDecoration:"underline"}}>Οι τρέχουσες ανάγκες →</Link>
   </div>:<>
   <div style={{display:"flex",justifyContent:"space-between",gap:25,alignItems:"center",flexWrap:"wrap",padding:"25px 0 35px"}}>
    <div><span style={{fontSize:12,color:"#748b76",letterSpacing:".14em"}}>ΧΡΗΜΑΤΟΔΟΤΙΚΟΣ ΚΥΚΛΟΣ</span>
     <h2 style={{fontSize:36,letterSpacing:"-.05em",margin:"9px 0"}}>{result.cycle.title}</h2>
     <p>Προϋπολογισμός κύκλου: <strong>{euroCents(result.cycle.funding_budget_cents)}</strong></p>
     <p style={{fontSize:13}}>Αρχή: {date(result.cycle.starts_at)} · Λήξη: {date(result.cycle.ends_at)}</p></div>
    <strong style={{padding:"13px 20px",background:"#d9e9d8"}}>Στάδιο: {result.cycle.status}</strong>
   </div>
   {result.has_voted?<section style={{padding:30,background:"#fff",border:"1px solid #b9cbbd"}}>
    <h3 style={{fontSize:28}}>Η ψήφος σου έχει καταχωριστεί</h3>
    <p>Η καταχώριση έγινε στις {result.my_vote?date(result.my_vote.created_at):"—"}. Το ψηφοδέλτιο είναι αμετάβλητο και δεν μπορεί να αποσυρθεί ή να ξαναυποβληθεί.</p>
    <p>Αριθμός έργων που υποστήριξες: {result.my_vote?.proposal_ids.length||0}.</p>
    <p style={{fontSize:13}}>Η ψήφος δεν αποτελεί πληρωμή ούτε εγγύηση ενίσχυσης. Το τελικό αποτέλεσμα και οι κατανομές υπόκεινται στους δημοσιευμένους κανόνες.</p>
   </section>:result.cycle.status!=="voting"||!result.voting_eligible||
      Date.parse(result.cycle.starts_at)>Date.now()||Date.parse(result.cycle.ends_at)<=Date.now()?
    <section style={{padding:28,background:"#fff"}}><h3>Η ψηφοφορία δεν είναι ανοιχτή για την επιχείρησή σου.</h3>
    <p>Οι προτάσεις μπορούν να προβληθούν, αλλά η υποβολή δεν επιτρέπεται εκτός της ελεγμένης περιόδου.</p></section>:null}
   <section style={{marginTop:38}}>
    <h2 style={{fontSize:32,letterSpacing:"-.04em"}}>Προτάσεις προς στήριξη</h2>
    <p style={{lineHeight:1.7}}>Η επιλογή πολλών έργων γίνεται με ένα ψηφοδέλτιο, όχι με πολλαπλές ψήφους. Η δική σου πρόταση δεν εμφανίζεται ως επιλέξιμη. Συνδεδεμένα έργα αποκλείονται από τον έλεγχο συμφερόντων.</p>
    {!result.proposals.length?<div style={{background:"#fff",padding:28}}>Δεν υπάρχουν εγκεκριμένες προτάσεις για επιλογή.</div>:
    <form action={castMaziFundBallot} style={{display:"grid",gap:12}}>
    <div style={{display:"grid",gap:12}}>{[...result.proposals].sort((a,b)=>Number(b.first_time_support_request)-Number(a.first_time_support_request)).map(p=><label key={p.id} style={{display:"flex",gap:20,background:"#fff",padding:25,border:"1px solid #d4ddd3",cursor:result.has_voted?"default":"pointer"}}>
     <input type="checkbox" name="proposal_id" value={p.id} disabled={result.has_voted||result.cycle?.status!=="voting"||!result.voting_eligible} style={{width:21,height:21,flexShrink:0,marginTop:5}}/>
     <span><span style={{fontSize:12,color:"#68836e"}}>{p.first_time_support_request?"ΠΡΩΤΗ ΑΙΤΗΣΗ · ΠΡΟΤΕΡΑΙΟΤΗΤΑ":"ΠΡΟΗΓΟΥΜΕΝΗ ΣΥΜΜΕΤΟΧΗ"} · {p.category}</span>
     <strong style={{display:"block",fontSize:22,margin:"8px 0"}}>{p.title}</strong>
     <span style={{display:"block",fontSize:14,lineHeight:1.65}}>{p.details}</span>
     <span style={{display:"block",fontWeight:700,marginTop:14}}>Αιτούμενο: {euroCents(p.amount_cents)}</span></span>
    </label>)}</div>
    {!result.has_voted&&result.cycle.status==="voting"&&result.voting_eligible&&
     Date.parse(result.cycle.starts_at)<=Date.now()&&Date.parse(result.cycle.ends_at)>Date.now()?
     <div style={{padding:25,background:"#e8ebe3"}}>
      <p>Με την καταχώριση επιβεβαιώνεις οριστικά τις προτάσεις που επιλέγεις. Ο ίδιος αριθμός ΓΕΜΗ δεν μπορεί να ψηφίσει ξανά στον κύκλο.</p>
      <button type="submit" style={{padding:"17px 28px",background:"#153d30",color:"#fff",border:0,cursor:"pointer",fontWeight:700}}>Οριστική υποβολή ψηφοδελτίου</button>
     </div>:null}
    </form>}
   </section>
   </>}
   <section style={{marginTop:55,borderTop:"1px solid #bed1bf",paddingTop:25,fontSize:14,lineHeight:1.7}}>
    <p>Η ψήφος προστατεύεται από ελέγχους αυθεντικής ταυτότητας, επαλήθευσης ΓΕΜΗ, προθεσμιών και συγκρούσεων συμφερόντων. Τα ταυτοποιημένα ψηφοδέλτια δεν δημοσιοποιούνται. <Link href="/fund/procedures" style={{textDecoration:"underline"}}>Όλοι οι κανόνες και η διαδικασία →</Link></p>
   </section>
  </section>
 </main>;
}

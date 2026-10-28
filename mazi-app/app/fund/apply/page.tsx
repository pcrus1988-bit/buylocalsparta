import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziFundMemberRequest,type MaziFundBallotState} from "../../../lib/mazi-api";
import {submitMaziFundingApplication} from "../../actions";
import {euroCents} from "../../../lib/fund-transparency";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Αίτηση Αναπτυξιακής Ενίσχυσης · ΜΑΖΙ",
 robots:{index:false,follow:false}};
const labels:Record<string,string>={
 submitted:"Η αίτηση υποβλήθηκε με επιτυχία και αναμένει τεκμηριωμένο έλεγχο.",
 already_submitted:"Υπάρχει ήδη αίτηση της ίδιας επιχείρησης (ΓΕΜΗ) στον κύκλο.",
 applications_not_open:"Η περίοδος χρηματοδοτικών αιτήσεων δεν είναι ανοιχτή.",
 invalid_project_application:"Έλεγξε τίτλο, ποσά, περιγραφή και αποδοχή όρων.",
 application_not_eligible:"Δεν ήταν δυνατή η υποβολή. Ελέγχονται η ταυτότητα ΓΕΜΗ και οι προϋποθέσεις.",
 paid_membership_required:"Η πραγματική χρηματοδοτική αίτηση απαιτεί τρέχουσα εξοφλημένη επαγγελματική συνδρομή με επαληθευμένο παραστατικό.",
 service_unavailable:"Δεν ολοκληρώθηκε η καταχώριση. Δεν δημιουργήθηκε ενίσχυση."
};
export default async function ApplyForFund({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziFundMemberRequest<MaziFundBallotState>("state");
 if(!state.ok&&state.error==="membership_required")redirect("/members");
 const p=await searchParams;
 return <main id="content" style={{background:"#f5f3ec",color:"#143b2f",minHeight:"100vh"}}>
  <header style={{background:"#143a30",color:"#fff",padding:"80px max(24px,calc((100vw - 1000px)/2))"}}>
   <span style={{fontSize:12,letterSpacing:".2em",color:"#b0caba"}}>ΜΑΖΙ / ΕΝΙΣΧΥΣΗ ΠΡΑΓΜΑΤΙΚΩΝ ΕΠΙΧΕΙΡΗΣΕΩΝ</span>
   <h1 style={{fontSize:"clamp(42px,6vw,75px)",lineHeight:1.1,letterSpacing:"-.07em",margin:"20px 0"}}>Πες μας τι χρειάζεται<br/><em style={{fontFamily:"Georgia,serif",fontWeight:400,color:"#edb99a"}}>για να αναπτυχθείς.</em></h1>
   <p style={{fontSize:18,lineHeight:1.7,maxWidth:730}}>Μία πραγματική επιχειρηματική πρόταση ανά επαληθευμένη νομική οντότητα και χρηματοδοτικό κύκλο. Ο σκοπός, η τεκμηρίωση και το ελάχιστο χρήσιμο ποσό θα ληφθούν υπόψη πριν από την ψηφοφορία και την κατανομή.</p>
   <Link href="/dashboard" style={{color:"#edb99a",display:"inline-block",marginTop:22}}>← Πίνακας μέλους</Link>
  </header>
  <div style={{maxWidth:1000,margin:"0 auto",padding:"55px 24px 100px"}}>
   {p.notice&&labels[p.notice]?<p role="status" style={{padding:20,background:"#fff",border:"1px solid #bac8b9"}}>{labels[p.notice]}</p>:null}
   {!state.ok?<section style={{background:"#fff",padding:30}}><h2>Η αίτηση δεν είναι διαθέσιμη</h2><p>Η υπηρεσία δεν επέστρεψε επαληθευμένη κατάσταση. Δεν επιχειρείται καταχώριση.</p></section>:
   !state.cycle?<section style={{background:"#fff",padding:30}}>
    <h2 style={{fontSize:30}}>Το Ταμείο δεν έχει ανοίξει χρηματοδοτικές αιτήσεις.</h2>
    <p style={{lineHeight:1.8}}>Ο υφιστάμενος ιδρυτικός κύκλος αποτυπώνει ανάγκες χωρίς χρηματοδότηση. Οι τρέχουσες ανάγκες υποβάλλονται στο προβλεπόμενο περιβάλλον.</p>
    <Link href="/proposals" style={{textDecoration:"underline"}}>Μετάβαση στις ανάγκες →</Link>
   </section>:state.my_proposal?<section style={{background:"#fff",padding:30}}>
    <span style={{fontSize:12,color:"#6e8c78"}}>ΚΑΤΑΧΩΡΙΣΜΕΝΗ ΑΙΤΗΣΗ · {state.my_proposal.status}</span>
    <h2 style={{fontSize:30,margin:"15px 0"}}>{state.my_proposal.title}</h2>
    <p>Αιτούμενο ποσό: <strong>{euroCents(state.my_proposal.amount_cents)}</strong></p>
    <p>Ελάχιστο χρήσιμο ποσό: {state.my_proposal.minimum_useful_cents===null?"—":euroCents(state.my_proposal.minimum_useful_cents)}</p>
    <p style={{lineHeight:1.7}}>Έχει καταχωριστεί μία αίτηση για τη συγκεκριμένη νομική επιχείρηση και τον κύκλο. Ο έλεγχος δεν αποτελεί χρηματοδοτική δέσμευση.</p>
   </section>:state.cycle.status!=="submissions"||Number(new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Athens",day:"numeric"}).format(new Date()))>10||Date.parse(state.cycle.starts_at)>Date.now()||Date.parse(state.cycle.ends_at)<=Date.now()?
    <section style={{background:"#fff",padding:30}}><h2>Ο κύκλος δεν δέχεται νέες αιτήσεις</h2>
    <p>Κατάσταση: {state.cycle.status}. Η περίοδος ή η διαδικασία υποβολής έχει κλείσει.</p></section>:
   <form action={submitMaziFundingApplication} style={{display:"grid",gap:22,background:"#fff",padding:"clamp(22px,5vw,42px)",border:"1px solid #d2ded1"}}>
    <div><span style={{fontSize:12,color:"#718876",letterSpacing:".14em"}}>ΚΥΚΛΟΣ</span>
    <h2 style={{fontSize:30,margin:"8px 0"}}>{state.cycle.title}</h2></div>
    <label style={{display:"grid",gap:8,fontWeight:700}}>Τίτλος έργου (8–140 χαρακτήρες)
     <input name="title" minLength={8} maxLength={140} required
      placeholder="Π.χ. Ανανέωση εξοπλισμού παραγωγής" style={{padding:15,border:"1px solid #a8bcae",font:"inherit"}}/></label>
    <label style={{display:"grid",gap:8,fontWeight:700}}>Κατηγορία
     <select name="category" required defaultValue="growth" style={{padding:15,border:"1px solid #a8bcae",font:"inherit"}}>
     <option value="growth">Ανάπτυξη και εκσυγχρονισμός</option>
     <option value="resilience">Ανθεκτικότητα και απαραίτητος εξοπλισμός</option>
     <option value="joint">Συνεργατική πρωτοβουλία</option></select></label>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:18}}>
     <label style={{display:"grid",gap:8,fontWeight:700}}>Αιτούμενο ποσό (€)
      <input name="amount_eur" type="number" min={500} max={200000} step=".01" required
        placeholder="5000" style={{padding:15,border:"1px solid #a8bcae",font:"inherit"}}/></label>
     <label style={{display:"grid",gap:8,fontWeight:700}}>Ελάχιστο ποσό που καθιστά το έργο εφικτό (€)
      <input name="minimum_useful_eur" type="number" min=".01" step=".01" required
        placeholder="2500" style={{padding:15,border:"1px solid #a8bcae",font:"inherit"}}/></label>
    </div>
    <label style={{display:"grid",gap:8,fontWeight:700}}>Αναλυτική τεκμηρίωση (80–4.000 χαρακτήρες)
     <textarea name="details" rows={9} minLength={80} maxLength={4000} required
      placeholder="Περιέγραψε την ανάγκη, τις δαπάνες, τους προμηθευτές, το χρονοδιάγραμμα, το αποτέλεσμα και το πώς θα τεκμηριώσεις την υλοποίηση."
      style={{padding:15,border:"1px solid #a8bcae",font:"inherit",resize:"vertical"}}/></label>
    <section style={{background:"#e6ede4",padding:25,lineHeight:1.7}}>
     <h3 style={{fontSize:22,margin:"0 0 8px"}}>Οι ειδικοί όροι συμμετοχής</h3>
     <p>Οι πρόσθετοι μήνες που προβλέπονται μετά από πραγματική χορήγηση υπολογίζονται με τον τύπο οροφή(αρχικό αιτούμενο ποσό / €100), ακόμη και αν η κοινότητα χορηγήσει μικρότερο ποσό. Δυνατότητα νέας αίτησης μετά την παρέλευση του 80% της πρόσθετης περιόδου. Η αίτηση δεν συνιστά χρέωση, υπόσχεση επιχορήγησης ή αυτοτελή δεσμευτική σύμβαση.</p>
     <label style={{display:"flex",gap:12,alignItems:"start",fontSize:14}}>
      <input type="checkbox" name="grant_terms_acknowledged" required style={{width:22,height:22,flexShrink:0,marginTop:4}}/>
      <span>Έχω διαβάσει τον <Link href="/fund/procedures" style={{textDecoration:"underline"}}>κανονισμό του Ταμείου</Link> και ενημερώθηκα για τη βάση υπολογισμού της μελλοντικής δέσμευσης συμμετοχής.</span>
     </label>
    </section>
    <button type="submit" style={{background:"#174534",color:"#fff",border:0,padding:"18px 26px",fontWeight:800,cursor:"pointer"}}>Υποβολή για έλεγχο επιλεξιμότητας</button>
    <p style={{fontSize:13,color:"#607767"}}>Η αποδοχή χρηματοδοτικής προσφοράς και η σύναψη σύμβασης αποτελούν ξεχωριστά επόμενα βήματα.</p>
   </form>}
  </div>
 </main>;
}

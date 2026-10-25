import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {maziInterestReviewQueue} from "../../../../lib/mazi-interest-admin";
import {reviewMaziInterestAction,issueMaziInvitationAction,revokeMaziInvitationAction,refreshMaziInterestRegistryAction,manualMaziGemiPublicityAction} from "./actions";
import {maziInvitationStates} from "../../../../lib/mazi-invitation-admin";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Έλεγχος αιτήσεων ΑΦΜ",robots:{index:false,follow:false}};
const registryCurrent=(row:{registry_lookup_status:string;gemi_number:string|null;registry_checked_at:Date|null})=>
 row.registry_lookup_status==="matched" && Boolean(row.gemi_number) && Boolean(row.registry_checked_at) &&
 Number.isFinite(new Date(row.registry_checked_at!).getTime()) &&
 Date.now()-new Date(row.registry_checked_at!).getTime()<=7*86400000;

export default async function InterestReview({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}>
  <h1>Μόνο ο ΚΟΝΤΑ ΜΟΥ Super Admin έχει πρόσβαση.</h1></div></main>;
 let rows:Awaited<ReturnType<typeof maziInterestReviewQueue>>|null=null;
 let invites:Awaited<ReturnType<typeof maziInvitationStates>>=[];
 try{[rows,invites]=await Promise.all([maziInterestReviewQueue(principal),maziInvitationStates(principal)]);}catch{}
 if(!rows)return <main className={s.stage}><div className={s.shell}><h1>Προσωρινά μη διαθέσιμο</h1><p>Δεν έγινε καμία αλλαγή.</p></div></main>;
 const params=await searchParams;
 const pending=rows.filter(r=>r.status==="pending_review"||r.status==="registry_review_required");
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin/mazi">ΚΟΝΤΑ ΜΟΥ / ΜΑΖΙ</Link><span>↗</span> ΑΙΤΗΣΕΙΣ ΑΦΜ <span>·</span><Link href="/admin/mazi/operations">Έλεγχος λειτουργίας ↗</Link></div>
  <header className={s.hero}><div>
   <p className={s.kicker}>SOLE SUPER ADMIN · VERIFIED BUSINESSES ONLY</p>
   <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Ενδιαφέρον</em></h1>
   <p className={s.subtitle}>Δημόσιες αιτήσεις μέσω ΑΦΜ με ανάκτηση στοιχείων ΓΕΜΗ.
     Η έγκριση επιτρέπει μόνο το επόμενο βήμα πρόσκλησης — δεν δημιουργεί λογαριασμό, μέλος ή δικαιώματα.</p>
  </div></header>
  {params.notice==="reviewed"?<p className={s.notice} role="status">Η απόφαση καταχωρίστηκε στο μητρώο ελέγχου. Δεν έχει σταλεί πρόσκληση.</p>:null}
  {params.notice==="gemi_refreshed"?<p className={s.notice} role="status">Ο νέος έλεγχος ΓΕΜΗ ολοκληρώθηκε απευθείας στον επίσημο πάροχο και καταγράφηκε χωρίς να αλλοιώσει την αρχική αίτηση. Μπορείς τώρα να προχωρήσεις, εφόσον έχουν γίνει οι ανεξάρτητοι έλεγχοι εκπροσώπου και email.</p>:null}
  {params.notice==="gemi_manual_recorded"?<p className={s.notice} role="status">Καταχωρίστηκε υπεύθυνος χειροκίνητος έλεγχος από την επίσημη Δημοσιότητα ΓΕΜΗ. Σημειώνεται ρητά ως ανθρώπινη επαλήθευση — όχι ως επιτυχής κλήση API. Δεν εγκρίθηκε ακόμη η αίτηση.</p>:null}
  {params.notice==="gemi_manual_invalid"?<p className={s.notice} role="alert">Η χειροκίνητη επαλήθευση δεν καταχωρίστηκε. Απαιτείται πραγματική επιβεβαίωση ενεργής εταιρείας και ταυτότητας, επίσημη διεύθυνση Δημοσιότητας ΓΕΜΗ και αναλυτική τεκμηρίωση 80–2.000 χαρακτήρων.</p>:null}
  {params.notice==="gemi_manual_mismatch"?<p className={s.notice} role="alert">Τα στοιχεία ΓΕΜΗ που επιβεβαίωσες δεν ταυτίζονται με την αρχική αίτηση. Δεν έγινε επαλήθευση ή έγκριση.</p>:null}
  {params.notice==="gemi_local_throttled"?<p className={s.notice} role="alert">Το όριο 3 κλήσεων ανά λεπτό του ΚΟΝΤΑ ΜΟΥ για το ΓΕΜΗ συμπληρώθηκε. Δοκίμασε ξανά μετά από τουλάχιστον ένα λεπτό. Δεν έγινε νέος έλεγχος, ούτε αλλαγή στην αίτηση.</p>:null}
  {params.notice==="gemi_provider_throttled"?<p className={s.notice} role="alert">Ο ίδιος ο πάροχος ΓΕΜΗ επέστρεψε περιορισμό κλήσεων (HTTP 429). Περίμενε πριν ξαναδοκιμάσεις. Η παλιά πληροφορία δεν θεωρήθηκε νέα επαλήθευση.</p>:null}
  {params.notice==="gemi_provider_auth"?<p className={s.notice} role="alert">Ο πάροχος ΓΕΜΗ δεν αποδέχθηκε την πρόσβαση του API (HTTP 401/403). Χρειάζεται έλεγχος της ενεργής εξουσιοδότησης/κλειδιού ΓΕΜΗ από διαχειριστή της υποδομής. Δεν βοηθά η συνεχής επανάληψη.</p>:null}
  {params.notice==="gemi_not_configured"?<p className={s.notice} role="alert">Δεν βρέθηκε ενεργό κλειδί ΓΕΜΗ για αυτήν τη λειτουργία στον server. Χρειάζεται έλεγχος της διαμόρφωσης. Δεν έγινε νέα επαλήθευση.</p>:null}
  {params.notice==="gemi_timeout"?<p className={s.notice} role="alert">Η επίσημη υπηρεσία ΓΕΜΗ δεν απάντησε εντός του ορίου χρόνου. Μπορείς να δοκιμάσεις ξανά αργότερα.</p>:null}
  {params.notice==="gemi_provider_unavailable"?<p className={s.notice} role="alert">Απέτυχε η επικοινωνία με τον επίσημο πάροχο ΓΕΜΗ. Καταγράφηκε κωδικός αιτίας στα server logs χωρίς προσωπικά στοιχεία. Έλεγξε τη διαθεσιμότητα της υπηρεσίας πριν επαναλάβεις.</p>:null}
  {params.notice==="gemi_incomplete"?<p className={s.notice} role="alert">Ο πάροχος ΓΕΜΗ επέστρεψε ελλιπή στοιχεία επιχείρησης και δεν μπορεί να δοθεί ασφαλής έγκριση.</p>:null}
  {params.notice==="gemi_mismatch"?<p className={s.notice} role="alert">Ο επίσημος έλεγχος δεν ταυτίστηκε με την αρχική νομική οντότητα ΓΕΜΗ. Η αίτηση δεν άλλαξε· χρειάζεται χειροκίνητη διερεύνηση.</p>:null}
  {params.notice==="gemi_manual_review"?<p className={s.notice} role="alert">Η αρχική αίτηση δεν είχε επιβεβαιωμένη ταύτιση ΓΕΜΗ. Δεν επιτρέπεται αυτόματη αντικατάσταση της αρχικής ταυτότητας· απαιτείται χωριστός έλεγχος.</p>:null}
  {params.notice==="verification_required"?<p className={s.notice} role="alert">Δεν καταχωρίστηκε έγκριση. Απαιτείται πρόσφατος έλεγχος ΓΕΜΗ (εντός 7 ημερών) και πραγματική, ανεξάρτητη επιβεβαίωση ενεργής επιχείρησης, νόμιμης εκπροσώπησης και ιδιοκτησίας του email. Συμπλήρωσε και τις τρεις επιβεβαιώσεις μόνο αφού ολοκληρώσεις τους ελέγχους.</p>:null}
  {params.notice==="review_invalid"?<p className={s.notice} role="alert">Δεν αποθηκεύτηκε απόφαση: η τεκμηρίωση πρέπει να είναι 20–1.000 χαρακτήρες και η αίτηση να είναι έγκυρη.</p>:null}
  {params.notice==="not_reviewable"?<p className={s.notice} role="alert">Η αίτηση δεν είναι πλέον διαθέσιμη για αξιολόγηση. Η κατάσταση ενδέχεται να άλλαξε· έλεγξε το ιστορικό.</p>:null}
  {params.notice==="already_member"?<p className={s.notice} role="alert">Η νομική οντότητα διαθέτει ήδη επαληθευμένη συμμετοχή στο ΜΑΖΙ. Δεν δημιουργήθηκε διπλή έγκριση.</p>:null}
  {params.notice==="invitation_sent"?<p className={s.notice} role="status">Ο πάροχος Auth αποδέχθηκε την αποστολή πρόσκλησης στο επαληθευμένο email. Η πραγματική παράδοση δεν έχει ακόμη επιβεβαιωθεί. Δεν δημιουργήθηκε συνδρομή ή μέλος.</p>:null}
  {params.notice==="invitation_delivery_failed"?<p className={s.notice} role="alert">Η αποστολή δεν επιβεβαιώθηκε. Απαιτείται έλεγχος της κατάστασης στο Supabase Auth πριν από νέα προσπάθεια.</p>:null}
  {params.notice==="invitation_revoked"?<p className={s.notice} role="status">Η προηγούμενη πρόσκληση ανακλήθηκε. Η ενδεχόμενη παλιά σύνδεση δεν παρέχει πλέον δικαίωμα ένταξης.</p>:null}
  {params.notice==="invitation_not_revoked"?<p className={s.notice} role="alert">Η ανάκληση απέτυχε ή δεν πληροί τους κανόνες καταγραφής. Δεν έγινε αλλαγή.</p>:null}
  {params.notice==="invitation_not_issued"?<p className={s.notice} role="alert">Δεν εκδόθηκε πρόσκληση. Έλεγξε τις προϋποθέσεις ταυτοποίησης, την υπάρχουσα πρόσκληση και τη ρύθμιση αποστολής.</p>:null}
  <section className={s.section}><div className={s.sectionTop}><div>
   <p>01 / INTAKE REVIEW</p><h2>Προς αξιολόγηση ({pending.length})</h2>
  </div><span>Ισχύει ανεξάρτητη επαλήθευση εκπροσώπου και email</span></div>
  {!pending.length?<div className={s.empty}>Δεν υπάρχουν εκκρεμείς αιτήσεις ΑΦΜ.</div>:
   <div className={s.stack}>{pending.map(a=><article key={a.id} className={s.card}>
    <div style={{flex:1,minWidth:0}}>
     <span className={s.tag}>{a.status==="pending_review"?"ΓΕΜΗ ΑΝΕΥΡΕΘΗ":"ΑΠΑΙΤΕΙΤΑΙ ΝΕΟΣ ΕΛΕΓΧΟΣ ΓΕΜΗ"} · {new Date(a.submitted_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
     <h3>{a.registry_legal_name||"Χωρίς επαληθευμένη επωνυμία"}</h3>
     <p className={s.meta}>ΑΦΜ: {a.tax_number} · ΓΕΜΗ: {a.gemi_number||"Δεν επιβεβαιώθηκε"}</p>
     <p className={s.meta}>Κατάσταση ΓΕΜΗ: {a.registry_company_status||"Απαιτείται έλεγχος"} · Περιοχή: {a.registry_city||"—"}</p>
     <p className={s.meta}>Έλεγχος: {a.registry_checked_at?new Date(a.registry_checked_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Μη διαθέσιμος"} · {a.registry_evidence_source==="gemi_publicity_manual"?"Χειροκίνητη βεβαίωση Super Admin":a.registry_evidence_source==="gemi_opendata_live"?"Ζωντανό API ΓΕΜΗ":"Αρχικός έλεγχος ΓΕΜΗ"}</p>
     {!registryCurrent(a)?<div style={{margin:"12px 0 16px",padding:16,background:"#fff0d7",border:"1px solid #d8a657",color:"#67421b",fontSize:13,lineHeight:1.6}} role="alert">
       <strong>Η έγκριση είναι προσωρινά απενεργοποιημένη.</strong>
       <p style={{margin:"8px 0"}}>Ο προηγούμενος έλεγχος ΓΕΜΗ είναι παλιότερος από επτά ημέρες ή δεν υπάρχει επιβεβαιωμένη ταύτιση.</p>
       {a.registry_lookup_status==="matched"&&Boolean(a.gemi_number)?
        <form action={refreshMaziInterestRegistryAction} style={{marginTop:12,display:"grid",gap:8}}>
         <input type="hidden" name="csrf" value={principal.csrfToken}/>
         <input type="hidden" name="id" value={a.id}/>
         <button type="submit" className={s.secondary} style={{background:"#fff9ed",whiteSpace:"normal"}}>Επανέλεγχος ΓΕΜΗ τώρα ↻</button>
         <span>Ζωντανή επανάκτηση από τον επίσημο πάροχο · δεν εγκρίνει την αίτηση.</span>
        </form>:
        <p>Χρειάζεται ανεξάρτητη διερεύνηση της αρχικής ταύτισης ΓΕΜΗ.</p>}
      </div>:<p className={s.meta} style={{color:"#276d45",fontWeight:700}}>✓ Πρόσφατη ταύτιση ΓΕΜΗ — μπορείς να αξιολογήσεις την αίτηση.</p>}
     {!registryCurrent(a)&&a.registry_lookup_status==="matched"&&Boolean(a.gemi_number)?<details style={{background:"#f4f2e8",border:"1px solid #adbda9",padding:14,margin:"12px 0"}}>
      <summary style={{fontWeight:700,cursor:"pointer"}}>Εναλλακτικά: τεκμηριωμένος χειροκίνητος έλεγχος ΓΕΜΗ</summary>
      <p className={s.body}>Μόνο μετά από πραγματικό έλεγχο της δημόσιας μερίδας στην <a href="https://publicity.businessportal.gr/" target="_blank" rel="noreferrer" style={{textDecoration:"underline"}}>επίσημη Δημοσιότητα ΓΕΜΗ ↗</a>. Δεν είναι επιτυχής κλήση API. Η απόφαση καταγράφεται αμετάβλητα με τον λογαριασμό Super Admin.</p>
      <form action={manualMaziGemiPublicityAction} className={s.action} style={{display:"grid",gap:12}}>
       <input type="hidden" name="csrf" value={principal.csrfToken}/>
       <input type="hidden" name="id" value={a.id}/>
       <label htmlFor={"manual-gemi-"+a.id}>Αριθμός ΓΕΜΗ που είδες στην επίσημη μερίδα (12 ψηφία)</label>
       <input id={"manual-gemi-"+a.id} type="text" name="confirmedGemi" required inputMode="numeric" pattern="[0-9]{12}" minLength={12} maxLength={12} style={{padding:12,width:"100%",boxSizing:"border-box"}}/>
       <label htmlFor={"manual-url-"+a.id}>Διεύθυνση επίσημου μητρώου που έλεγξες</label>
       <input id={"manual-url-"+a.id} type="url" name="sourceUrl" required placeholder="https://publicity.businessportal.gr/" style={{padding:12,width:"100%",boxSizing:"border-box"}}/>
       <label htmlFor={"manual-proof-"+a.id}>Στοιχεία ελέγχου (80–2.000 χαρακτήρες)</label>
       <textarea id={"manual-proof-"+a.id} name="evidence" required minLength={80} maxLength={2000} rows={5} placeholder="Πότε και σε ποια δημόσια μερίδα έγινε ο έλεγχος, κατάσταση ενεργής εταιρείας, επωνυμία και ταυτοποίηση ΑΦΜ/ΓΕΜΗ."/>
       <label style={{display:"flex",gap:8}}><input type="checkbox" name="confirmedIdentity" required/><span>Επιβεβαίωσα στο επίσημο μητρώο ότι η επωνυμία, το ΑΦΜ και ο αριθμός ΓΕΜΗ ταυτίζονται με την αρχική αίτηση.</span></label>
       <label style={{display:"flex",gap:8}}><input type="checkbox" name="confirmedActive" required/><span>Επιβεβαίωσα ότι η επιχείρηση είναι ενεργή σήμερα.</span></label>
       <button type="submit" className={s.secondary} style={{whiteSpace:"normal"}}>Καταχώριση χειροκίνητης επαλήθευσης (χωρίς έγκριση)</button>
      </form>
     </details>:null}
     <p className={s.meta}>Εκπρόσωπος (δήλωση): {a.representative_name}</p>
     <p className={s.meta}>Email επικοινωνίας (μη επαληθευμένο): {a.contact_email}</p>
     <p className={s.body}>{a.application_note}</p>
     <p className={s.disclaimer}>ΠΡΟΣΟΧΗ: Η εύρεση ΓΕΜΗ δεν αποδεικνύει ότι αυτό το πρόσωπο εκπροσωπεί την επιχείρηση. Μην αποδεχτείτε αν δεν έχει γίνει ανεξάρτητος έλεγχος.</p>
    </div>
    <div style={{width:"100%",minWidth:0,maxWidth:420}}>
     <form action={reviewMaziInterestAction} className={s.action} style={{display:"grid",gap:12}}>
      <input type="hidden" name="csrf" value={principal.csrfToken}/>
      <input type="hidden" name="id" value={a.id}/>
      <label className={s.tag} htmlFor={"approve-reason-"+a.id}>Τεκμηρίωση έγκρισης (20–1000 χαρακτήρες)</label>
      <textarea id={"approve-reason-"+a.id} name="reason" required minLength={20} maxLength={1000} rows={4}
       style={{padding:14,border:"1px solid #8ea68e",font:"inherit"}}
       placeholder="Κατέγραψε τις ανεξάρτητες πηγές ελέγχου εκπροσώπου, email και ενεργής επιχείρησης"/>
      <label style={{display:"flex",gap:8,alignItems:"start"}}>
       <input name="representativeVerified" type="checkbox" required/>
       <span>Έλεγξα ανεξάρτητα ότι ο αιτών εκπροσωπεί τη νομική οντότητα.</span>
      </label>
      <label style={{display:"flex",gap:8,alignItems:"start"}}>
       <input name="emailVerified" type="checkbox" required/>
       <span>Επιβεβαίωσα την ιδιοκτησία του δηλωμένου email (όχι μόνο μέσω δημόσιου ΓΕΜΗ).</span>
      </label>
      <label style={{display:"flex",gap:8,alignItems:"start"}}>
       <input name="companyActiveVerified" type="checkbox" required/>
       <span>Έλεγξα ανεξάρτητα ότι η επιχείρηση είναι ενεργή στο ΓΕΜΗ.</span>
      </label>
      {!registryCurrent(a)?<p className={s.disclaimer} role="alert" style={{marginTop:0}}>Η έγκριση δεν επιτρέπεται ακόμη: δεν υπάρχει επιτυχής και πρόσφατος (εντός 7 ημερών) έλεγχος ΓΕΜΗ. Απαιτείται νέος έλεγχος της εγγραφής.</p>:null}
      <button type="submit" name="decision" value="approve" className={s.primary}
       disabled={!registryCurrent(a)} aria-disabled={!registryCurrent(a)}>
        {registryCurrent(a)?"Έγκριση για μελλοντική πρόσκληση":"Απαιτείται πρώτα επανέλεγχος ΓΕΜΗ"}
      </button>
     </form>
     <form action={reviewMaziInterestAction} className={s.action} style={{display:"grid",gap:8,marginTop:18}}>
      <input type="hidden" name="csrf" value={principal.csrfToken}/>
      <input type="hidden" name="id" value={a.id}/>
      <label className={s.tag} htmlFor={"decline-reason-"+a.id}>Αιτιολογία απόρριψης (20–1000 χαρακτήρες)</label>
      <textarea id={"decline-reason-"+a.id} name="reason" required minLength={20} maxLength={1000} rows={3}
       style={{padding:14,border:"1px solid #8ea68e",font:"inherit"}}
       placeholder="Κατέγραψε τους συγκεκριμένους λόγους απόρριψης"/>
      <button type="submit" name="decision" value="decline" className={s.secondary}>Απόρριψη</button>
     </form>
    </div>
   </article>)}</div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / REVIEW HISTORY</p><h2>Προηγούμενες αποφάσεις</h2></div></div>
   {rows.filter(r=>!["pending_review","registry_review_required"].includes(r.status)).map(r=>{
    const latest=invites.find(i=>i.interest_id===r.id);
    return <div key={r.id} className={s.member} style={{display:"grid",gap:12}}>
      <strong>{r.registry_legal_name||r.tax_number}</strong>
      <span>{r.status==="approved_pending_invite"?"Εγκεκριμένη προς πρόσκληση":"Απορρίφθηκε"} · {r.review_reason||"—"}</span>
      {latest?<span>Πρόσκληση: {latest.status} · {new Date(latest.issued_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})} · λήξη {new Date(latest.expires_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>:null}
      {r.status==="approved_pending_invite"&&(!latest||latest.status==="revoked"||latest.status==="delivery_failed")?
       <form action={issueMaziInvitationAction} className={s.action} style={{display:"grid",gap:8}}>
        <input type="hidden" name="csrf" value={principal.csrfToken}/>
        <input type="hidden" name="id" value={r.id}/>
        {latest?.status==="delivery_failed"?<>
         <p>Η προηγούμενη αποστολή είναι αβέβαιη. Πριν από νέα πρόσκληση, επαλήθευσε χειροκίνητα την κατάσταση στο Supabase Auth.</p>
         <label>Τεκμηρίωση ελέγχου της αποστολής (20–1.000 χαρακτήρες)
          <textarea name="reconciliation_reason" required minLength={20} maxLength={1000} rows={3}/>
         </label>
         <label><input type="checkbox" name="provider_reconciled" required/> Επιβεβαιώνω ότι εξέτασα τον παραλήπτη και την κατάσταση της προηγούμενης αποστολής στον πάροχο.</label>
        </>:null}
        <button type="submit" className={s.primary}>{latest?"Επανέκδοση ατομικής πρόσκλησης":"Αποστολή προσωπικής πρόσκλησης"} ↗</button>
       </form>:null}
      {latest&&(latest.status==="pending_delivery"||latest.status==="email_sent")?
       <form action={revokeMaziInvitationAction} className={s.action} style={{display:"grid",gap:8}}>
        <input type="hidden" name="csrf" value={principal.csrfToken}/>
        <input type="hidden" name="id" value={r.id}/>
        <input type="hidden" name="invitation_id" value={latest.id}/>
        <label>Αιτιολογία ανάκλησης (20–1.000 χαρακτήρες)
          <textarea name="revocation_reason" required minLength={20} maxLength={1000} rows={3}/>
        </label>
        <label><input type="checkbox" name="confirm_revocation" required/> Κατανοώ ότι ανακαλείται η δυνατότητα ένταξης, ακόμη και αν ο παραλήπτης διατηρεί τον σύνδεσμο email.</label>
        <button type="submit">Ανάκληση προσωπικής πρόσκλησης ↗</button>
       </form>:null}
    </div>;
   })}
  </section>
 </div></main>;
}

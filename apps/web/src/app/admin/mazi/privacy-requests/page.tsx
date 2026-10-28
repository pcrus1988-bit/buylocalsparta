import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {MAZI_RIGHTS_KIN,readMaziPrivacyRequests} from "../../../../lib/mazi-privacy-rights";
import {createMaziPrivacyCaseAction,transitionMaziPrivacyCaseAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Αιτήματα GDPR · Super Admin",robots:{index:false,follow:false}};
const kinds:Record<string,string>={
 access:"Πρόσβαση (άρθ. 15)",rectification:"Διόρθωση (άρθ. 16)",
 erasure:"Διαγραφή (άρθ. 17)",restriction:"Περιορισμός (άρθ. 18)",
 portability:"Φορητότητα (άρθ. 20)",objection:"Εναντίωση (άρθ. 21)",
 consent_withdrawal:"Ανάκληση συγκατάθεσης",other:"Άλλο αίτημα"
};
const dateLabel=(v:string|null)=>v||"—";
const todayAthens=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",
 year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export default async function MaziPrivacyRequestsPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><section className={s.denied}>
  <h1>Μόνο Super Admin</h1><p>Το μητρώο αιτημάτων προσωπικών δεδομένων δεν είναι δημόσιο.</p>
 </section></main>;
 let snapshot:Awaited<ReturnType<typeof readMaziPrivacyRequests>>|null=null;
 try{snapshot=await readMaziPrivacyRequests(principal);}catch{}
 const {notice}=await searchParams;
 const today=todayAthens();
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>↗</span>
   <Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span>
   <Link href="/admin/mazi/operations">Επιχειρησιακός έλεγχος</Link><span>↗</span>
   <span>GDPR RIGHTS</span></div>
  <header className={s.hero}><div>
   <p className={s.kicker}>ΑΡΘΡΑ 12–22 GDPR · SUPER ADMIN ONLY</p>
   <h1>Αιτήματα GDPR<span className={s.dot}>.</span><em>Ελεγκτικό μητρώο</em></h1>
   <p className={s.subtitle}>Πραγματικά περιστατικά, ημερομηνία παραλαβής, νόμιμες προθεσμίες και εσωτερικές αναφορές αποδεικτικών. Δεν συλλέγονται ονόματα, emails, ΑΦΜ, συνομιλίες ή έγγραφα ταυτότητας εδώ.</p>
  </div><div className={s.lock}><strong>ΔΕΝ ΕΚΤΕΛΕΙ ΔΙΑΓΡΑΦΗ / ΑΠΑΝΤΗΣΗ</strong>
   <span>Η απάντηση, ο έλεγχος ταυτότητας και η επικοινωνία με το υποκείμενο γίνονται στην πραγματικότητα, εκτός μητρώου, με ελέγξιμο αποδεικτικό.</span>
   <a href="https://www.dpa.gr/el/polites/gkpd" target="_blank" rel="noreferrer">ΑΠΔΠΧ / GDPR ↗</a>
  </div></header>
  {notice==="created"?<p role="status" className={s.notice}>Η υπόθεση καταχωρίστηκε με γεγονός παραλαβής.</p>:null}
  {notice==="updated"?<p role="status" className={s.notice}>Το γεγονός και το τεκμήριο καταχωρίστηκαν στο αμετάβλητο ιστορικό.</p>:null}
  {notice==="invalid"?<p role="alert" className={s.notice}>Μη έγκυρη ενέργεια: έλεγξε ημερομηνίες, προθεσμία, ταυτοποίηση, αποδεικτικό και προηγούμενη κατάσταση.</p>:null}
  <section className={s.section}><div className={s.sectionTop}>
   <div><p>01 / DEADLINES</p><h2>Αληθινές υποθέσεις</h2></div>
   <span>Η προθεσμία αρχίζει από την πραγματική παραλαβή του αιτήματος, όχι την καταχώριση εδώ.</span>
  </div>
   {!snapshot?<p className={s.empty} role="alert">Το μητρώο δεν είναι διαθέσιμο. Δεν παρουσιάζονται ψευδή μηδενικά· ελέγξτε τη βάση και την εφαρμογή της νέας μετανάστευσης.</p>:
    <div className={s.stats} style={{gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))"}}>
     <div><small>ΕΚΚΡΕΜΗ</small><strong>{snapshot.stats.open}</strong><span>Σύνολο μητρώου · εμφανίζονται έως 150</span></div>
     <div><small>ΕΚΠΡΟΘΕΣΜΑ</small><strong>{snapshot.stats.overdue}</strong><span>Απαιτείται άμεση πραγματική απάντηση</span></div>
     <div><small>ΑΝΟΙΧΤΕΣ ΠΑΡΑΤΑΣΕΙΣ</small><strong>{snapshot.stats.extended_open}</strong><span>Πρέπει να υπάρχει πραγματική εμπρόθεσμη ειδοποίηση</span></div>
     <div><small>ΝΟΜΙΚΑ HOLDS</small><strong>{snapshot.stats.legal_holds}</strong><span>Δεν συνεπάγονται γενική παράταση απάντησης</span></div>
    </div>}
   <p className={s.disclaimer}>Άρθρο 12§3 GDPR: απάντηση χωρίς αδικαιολόγητη καθυστέρηση και, κατά κανόνα, εντός ενός μήνα. Παράταση έως δύο επιπλέον μήνες μόνο λόγω πολυπλοκότητας ή πλήθους αιτημάτων, με έγκαιρη ενημέρωση μέσα στον πρώτο μήνα. Το μητρώο δεν υποκαθιστά την παρακολούθηση του info@kontamou.site.</p>
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / INTAKE</p><h2>Νέα υπόθεση</h2></div><span>Χειροκίνητη εισαγωγή ΜΟΝΟ μετά από πραγματικό αίτημα</span></div>
   {snapshot?<form action={createMaziPrivacyCaseAction} className={s.card} style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))"}}>
    <input type="hidden" name="csrf" value={principal.csrfToken}/>
    <label className={s.field}>Δικαίωμα <select name="request_kind" required>
     {MAZI_RIGHTS_KINDS.map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select></label>
    <label className={s.field}>Ημερομηνία πραγματικής παραλαβής
     <input name="received_on" type="date" required max={today}/></label>
    <label className={s.field} style={{gridColumn:"1/-1"}}>Εσωτερική αναφορά πραγματικού εισερχομένου
     <input name="evidence_ref" required minLength={12} maxLength={180} pattern="[A-Za-z0-9_./:#-]+"
      placeholder="GMAIL-THREAD-20261028-001"/>
    </label>
    <p className={s.disclaimer} style={{gridColumn:"1/-1",margin:0}}>Μην εισάγετε στοιχεία ταυτότητας, email, το κείμενο του αιτήματος ή προσωπικές πληροφορίες στην αναφορά. Χρησιμοποιήστε μόνο κωδικό εσωτερικού ticket.</p>
    <button type="submit" className={s.primary} style={{justifySelf:"start"}}>Καταχώριση πραγματικής παραλαβής</button>
   </form>:null}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>03 / CASE WORKFLOW</p><h2>Διαχείριση και τεκμήρια</h2></div><span>Κάθε μεταβολή καταγράφει αμετάβλητο συμβάν</span></div>
   {!snapshot?<p className={s.empty}>Το μητρώο είναι προσωρινά μη διαθέσιμο.</p>:
   !snapshot.cases.length?<p className={s.empty}>Δεν έχουν καταχωριστεί ακόμη υποθέσεις. Αυτό δεν αποδεικνύει ότι δεν έχουν φτάσει αιτήματα στην εταιρική αλληλογραφία.</p>:
   <div className={s.stack}>{snapshot.cases.map(item=><article className={s.card} key={item.id}>
    <div style={{flex:1,minWidth:220}}>
     <span className={s.tag}>{item.case_ref} · {item.case_status==="open"?"ΑΝΟΙΧΤΟ":"ΑΠΑΝΤΗΘΗΚΕ"}</span>
     <h3>{kinds[item.request_kind]}</h3>
     <p className={s.meta}>Παραλαβή: {dateLabel(item.received_on)} · Προθεσμία: <strong>{item.due_on}</strong>
      {item.case_status==="open"&&item.due_on<today?" · ΕΚΠΡΟΘΕΣΜΟ":""}</p>
     <p className={s.meta}>Ταυτοποίηση: {item.identity_status} · Παράταση: {dateLabel(item.extension_notified_on)}
       {item.extension_reason?" ("+item.extension_reason+")":""} · Legal hold: {item.legal_hold_active?"ΝΑΙ":"όχι"}</p>
     {item.response_sent_on?<p className={s.meta}>Απάντηση: {item.response_sent_on} · {item.response_outcome}</p>:null}
     <p className={s.meta}>Τελευταία αποδεικτικά:</p>
     <ul style={{paddingLeft:20}}>
      {snapshot.events.filter(e=>e.request_id===item.id).slice(0,6).map((ev,i)=><li key={i} className={s.meta}>
       {ev.event_kind} · {ev.evidence_ref} · {new Date(ev.recorded_at).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}
      </li>)}
     </ul>
    </div>
    <form action={transitionMaziPrivacyCaseAction} className={s.action} style={{display:"grid",gap:9,minWidth:220,maxWidth:330}}>
     <input type="hidden" name="csrf" value={principal.csrfToken}/>
     <input type="hidden" name="case_id" value={item.id}/>
     <label className={s.field}>Πραγματικό γεγονός<select name="action" required defaultValue="identity_verified">
      <option value="identity_verified">Ταυτότητα ελέγχθηκε</option>
      <option value="identity_unverifiable">Δεν επιβεβαιώνεται ταυτότητα</option>
      <option value="extension_notified">Εστάλη ειδοποίηση παράτασης</option>
      <option value="response_sent">Απάντηση αποστάλθηκε</option>
      <option value="legal_hold_placed">Τεκμηριωμένο νομικό hold</option>
      <option value="legal_hold_released">Άρση νόμιμου hold</option>
      <option value="reopened">Επανέναρξη υπόθεσης</option>
     </select></label>
     <label className={s.field}>Κωδικός αποδεικτικού
      <input name="evidence_ref" required minLength={12} maxLength={180} pattern="[A-Za-z0-9_./:#-]+"
       placeholder="GDPR-TICKET-2026-001"/></label>
     <label className={s.field}>Ημερομηνία (για απάντηση/παράταση)
      <input name="event_on" type="date" max={today}/></label>
     <label className={s.field}>Λόγος παράτασης (μόνο για παράταση)
      <select name="reason" defaultValue=""><option value="">Δεν αφορά</option>
       <option value="complexity">Πολυπλοκότητα</option>
       <option value="number_of_requests">Πλήθος αιτημάτων</option></select></label>
     <label className={s.field}>Αποτέλεσμα (μόνο για απάντηση)
      <select name="outcome" defaultValue=""><option value="">Δεν αφορά</option>
       <option value="fulfilled">Ικανοποιήθηκε</option>
       <option value="partially_fulfilled">Μερικώς ικανοποιήθηκε</option>
       <option value="refused_with_reason">Απόρριψη με αιτιολογία</option>
       <option value="cannot_identify">Αδυναμία ταυτοποίησης</option>
      </select></label>
     <button type="submit" className={s.secondary}>Καταχώριση αποδεικτικού</button>
    </form>
   </article>)}</div>}
  </section>
  <p className={s.disclaimer}>Δεν εφαρμόζεται αυτόματη διαγραφή ή εξαγωγή δεδομένων. Ο νομικός έλεγχος, η ορθότητα της πραγματικής απάντησης, οι DPA/processor ειδοποιήσεις και η διατήρηση των πρωτογενών αποδεικτικών παραμένουν ευθύνη του εξουσιοδοτημένου χειριστή.</p>
 </div></main>;
}

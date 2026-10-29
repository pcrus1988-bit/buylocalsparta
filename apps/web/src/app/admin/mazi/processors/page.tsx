import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {MAZI_PROCESSOR_DOMAINS,MAZI_PROCESSOR_CHECKS,readMaziProcessorReviews} from "../../../../lib/mazi-processor-reviews";
import {recordMaziProcessorReviewAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Εκτελούντες και διεθνείς διαβιβάσεις · Admin",robots:{index:false,follow:false}};
const roleNames={
 processor:"Εκτελών την επεξεργασία",independent_controller:"Ανεξάρτητος υπεύθυνος",
 joint_controller:"Από κοινού υπεύθυνος",no_personal_data:"Δεν υπάρχει επεξεργασία",
 pending:"Ανεπιβεβαίωτος ρόλος"
};
const transferNames={
 eea_only_verified:"Μόνο ΕΟΧ — τεκμηριωμένο",
 adequacy_verified:"Επάρκεια — συγκεκριμένη χώρα και απόφαση",
 scc_tia_verified:"SCC + τεκμηριωμένη εκτίμηση TIA",
 exception_reviewed:"Ειδική παρέκκλιση — νομικός έλεγχος άρθρου 49",
 not_applicable:"Δεν εφαρμόζεται",
 not_assessed:"Δεν έχει αξιολογηθεί"
};
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",
 year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default async function MaziProcessorDashboard({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}>
  <div className={s.denied}><h1>Μόνο Super Admin</h1><p>Περιορισμένο μητρώο ελέγχου τρίτων παρόχων.</p></div>
 </main>;
 let data:Awaited<ReturnType<typeof readMaziProcessorReviews>>|null=null;
 try{data=await readMaziProcessorReviews(principal);}catch{}
 const notice=(await searchParams).notice;
 const reviewed=data?MAZI_PROCESSOR_DOMAINS.filter(c=>data!.latest.some(r=>
  r.domain_key===c.key&&r.review_state==="evidence_recorded"&&
  (!c.required||r.usage_state==="in_use"))).length:0;
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>↗</span>
   <Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span>
   <Link href="/admin/mazi/operations">Νομικός έλεγχος</Link><span>↗</span><span>PROCESSORS</span>
  </div>
  <header className={s.hero}><div>
   <p className={s.kicker}>GDPR ΑΡΘΡΑ 28, 30, 32, 33, 44–49 · ΕΜΠΙΣΤΕΥΤΙΚΟ ΜΗΤΡΩΟ</p>
   <h1>Εκτελούντες<span className={s.dot}>.</span><em>Συμβάσεις και διαβιβάσεις</em></h1>
   <p className={s.subtitle}>Ελέγξτε τους πραγματικούς παρόχους, την εφαρμοστέα συμβατική σχέση, τους υποεκτελούντες, τις χώρες και τη διατήρηση αντιγράφων. Καμία κατηγορία δεν χαρακτηρίζεται εγκεκριμένη χωρίς πραγματικά τεκμήρια.</p>
  </div><div className={s.lock}>
   <strong>ΔΕΝ ΠΑΡΑΓΕΙ ΝΟΜΙΚΗ ΕΓΚΡΙΣΗ</strong>
   <span>Καταγράφει μόνο ανθρώπινες δηλώσεις με αποδεικτικά. Δεν συνδέεται στον λογαριασμό συμβάσεων, δεν αποδέχεται DPA, δεν αποστέλλει μηνύματα ούτε διαγράφει δεδομένα.</span>
   <a href="https://eur-lex.europa.eu/legal-content/EL/TXT/?uri=CELEX:32016R0679" target="_blank" rel="noreferrer">Επίσημος GDPR ↗</a>
   <Link href="/admin/mazi/retention">Απογραφή διατήρησης ↗</Link>
  </div></header>
  {notice==="invalid"?<p className={s.notice} role="alert">Μη αποδεκτή βεβαίωση: ελέγξτε υποχρεωτικές πηγές, πραγματικές συμφωνίες, χώρες, αιτιολογία, ημερομηνίες και όλες τις δηλώσεις.</p>:null}
  {notice==="recorded"?<p className={s.notice} role="status">Η ανθρώπινη δήλωση καταχωρίστηκε στο αμετάβλητο ιστορικό. Δεν έχει δοθεί γενική νομική έγκριση.</p>:null}
  <section className={s.section}><div className={s.sectionTop}>
   <div><p>01 / COVERAGE</p><h2>Πραγματικοί έλεγχοι παρόχων</h2></div>
   <span>{data?reviewed+" / "+MAZI_PROCESSOR_DOMAINS.length:"Μη διαθέσιμο"}</span>
  </div>
  {!data?<p className={s.empty} role="alert">Το μητρώο δεν είναι διαθέσιμο. Η ετοιμότητα δεν θεωρείται επαληθευμένη.</p>:
   <div className={s.card}><p className={s.body}><strong>Ελεγμένες κατηγορίες: {reviewed} από {MAZI_PROCESSOR_DOMAINS.length}.</strong> Οι τρεις βασικές υποδομές απαιτούν πραγματική επεξεργασία και έλεγχο· οι λοιπές επιτρέπεται να τεκμηριωθούν ως ανενεργές, μόνο με ελέγξιμη απόδειξη.</p>
    <p className={s.meta}>Οι πάροχοι που αναφέρονται ενδεικτικά δεν αποτελούν καταγεγραμμένη ενεργή λίστα. Εντός κάθε τομέα πρέπει να περιληφθούν ΟΛΟΙ οι πραγματικοί αποδέκτες και υποεκτελούντες. Δεν αποθηκεύουμε συμβάσεις, ονόματα φυσικών προσώπων, email, ΑΦΜ, κλειδιά ή μυστικά στο μητρώο.</p>
   </div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}>
   <div><p>02 / EVIDENCE</p><h2>Έλεγχος ανά λειτουργία</h2></div>
   <span>Η νεότερη απόφαση ισχύει για κάθε τομέα· η επανέναρξη διατηρεί το ιστορικό.</span>
  </div>
  {data?<div className={s.stack}>{MAZI_PROCESSOR_DOMAINS.map((domain,i)=>{
   const recent=data!.latest.find(x=>x.domain_key===domain.key);
   return <article key={domain.key} className={s.card}>
    <div style={{flex:1,minWidth:240}}>
     <span className={s.tag}>{String(i+1).padStart(2,"0")} / {recent?.review_state==="evidence_recorded"?"ΔΗΛΩΘΗΚΕ ΕΛΕΓΧΟΣ":"ΕΚΚΡΕΜΕΙ ΕΛΕΓΧΟΣ"}</span>
     <h3>{domain.title}</h3>
     <p className={s.body}>{domain.examples}</p>
     <p className={s.meta}>{domain.required?"ΒΑΣΙΚΗ ΥΠΟΔΟΜΗ · ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ 'ΔΕΝ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ'":"Υποχρεωτική πραγματική απογραφή ακόμη και αν δεν χρησιμοποιείται"}</p>
     {recent?<p className={s.meta}>Τελευταία δήλωση: {recent.usage_state==="in_use"?"Ενεργός τομέας":"Ανενεργός τομέας"} · {recent.processing_role} · {recent.transfer_mechanism} · {recent.evidence_reference} · {new Date(recent.recorded_at).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}</p>:null}
     {recent?<p className={s.body}>{recent.findings}</p>:null}
    </div>
    <form action={recordMaziProcessorReviewAction} className={s.action} style={{display:"grid",gap:10,width:"100%",minWidth:235,maxWidth:450}}>
     <input type="hidden" name="csrf" value={principal.csrfToken}/>
     <input type="hidden" name="domain_key" value={domain.key}/>
     <label className={s.field}>Κατάσταση πηγής
      <select name="usage_state" required defaultValue="in_use">
       <option value="in_use">Πραγματική επεξεργασία — in use</option>
       {!domain.required?<option value="not_used">Απουσία επεξεργασίας — τεκμηριωμένη</option>:null}
      </select></label>
     <label className={s.field}>Πραγματικός ρόλος
      <select name="processing_role" required defaultValue="pending">
       {Object.entries(roleNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}
      </select></label>
     <label className={s.field}>Νομικός μηχανισμός διεθνών διαβιβάσεων
      <select name="transfer_mechanism" required defaultValue="not_assessed">
       {Object.entries(transferNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}
      </select></label>
     <label className={s.field}>Ημερομηνία πραγματικού ελέγχου
      <input type="date" name="reviewed_on" required max={today()} defaultValue={today()}/></label>
     <fieldset style={{border:"1px solid #b8c5b4",padding:12,display:"grid",gap:10}}>
      <legend>Υποχρεωτικοί έλεγχοι για ενεργή επεξεργασία</legend>
      {MAZI_PROCESSOR_CHECKS.map(check=><label key={check.id} style={{display:"flex",gap:8,alignItems:"start",fontSize:12}}>
       <input type="checkbox" name="review_checks" value={check.id}/><span>{check.label}</span>
      </label>)}
      {!domain.required?<label style={{display:"flex",gap:8,alignItems:"start",fontSize:12}}>
       <input type="checkbox" name="review_checks" value="not_used_verified"/>
       <span>ΜΟΝΟ αν δεν χρησιμοποιείται: έλεγξα τεχνικά και συμβατικά ότι δεν υφίσταται ροή δεδομένων.</span>
      </label>:null}
     </fieldset>
     <label className={s.field}>Εσωτερική αναφορά σύμβασης/DPA/νομικής πράξης (για ενεργή χρήση)
      <input type="text" name="agreement_reference" minLength={12} maxLength={180} pattern="[A-Za-z0-9_./:#-]+" placeholder="LEGAL-DPA-SUPABASE-2026-001"/></label>
     <label className={s.field}>Αναφορά πραγματικού τεκμηρίου
      <input type="text" name="evidence_reference" required minLength={12} maxLength={180}
       pattern="[A-Za-z0-9_./:#-]+" placeholder="LEGAL-PROCESSOR-REVIEW-2026-001"/></label>
     <label className={s.field}>Πραγματικό εύρημα, πάροχοι, χώρες, εκκρεμότητες (60–700 χαρακτήρες)
      <textarea name="findings" minLength={60} maxLength={700} required rows={5}
       placeholder="Πραγματική ημερομηνία ελέγχου, εκδόσεις συμβάσεων, γεωγραφικές ροές, αποδεικτικά, εκκρεμότητες. Χωρίς δεδομένα προσώπων."/></label>
     <button type="submit" name="review_state" value="evidence_recorded" className={s.primary}>Καταγραφή πραγματικού ελέγχου</button>
     <button type="submit" name="review_state" value="reopened" className={s.secondary}>Ανάκληση / επανέναρξη</button>
    </form>
   </article>;
  })}</div>:null}
  </section>
  <section className={s.section}><div className={s.sectionTop}>
   <div><p>03 / AUDIT</p><h2>Αμετάβλητο ιστορικό</h2></div></div>
   {data?.history.length?<div className={s.stack}>{data.history.map(x=><div key={x.id} className={s.card}>
    <div><strong>{x.domain_key} · {x.review_state}</strong><p className={s.meta}>{x.evidence_reference} · {new Date(x.recorded_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</p>
     <p className={s.body}>{x.findings}</p></div></div>)}</div>:
   <p className={s.empty}>Κανένα πραγματικό τεκμήριο δεν έχει καταχωριστεί.</p>}
  </section>
  <p className={s.disclaimer}>Οι δηλώσεις υποβάλλονται μόνο από εξουσιοδοτημένο Super Admin, με έλεγχο ενεργού ρόλου στη βάση. Αποθηκεύονται χωρίς προσωπικά δεδομένα και δεν αποτελούν αυτοματοποιημένη γνωμοδότηση ή υπογραφή νομικού συμβούλου. Η άσκηση δικαιωμάτων, διαγραφή και ειδοποίηση περιστατικών παραμένουν χωριστές διαδικασίες.</p>
 </div></main>;
}

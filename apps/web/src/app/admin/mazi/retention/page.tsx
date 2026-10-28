import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {MAZI_RETENTION_CATEGORIES,MAZI_RETENTION_CHECKS,readMaziRetentionReviews} from "../../../../lib/mazi-retention-reviews";
import {maziRetentionInventory} from "../../../../lib/mazi-retention-readiness";
import {recordMaziRetentionReviewAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Νομική τεκμηρίωση διατήρησης · Admin",robots:{index:false,follow:false}};
export default async function MaziRetentionAdmin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.denied}>
  <h1>Πρόσβαση μόνο για τον Super Admin</h1></div></main>;
 let snapshot:Awaited<ReturnType<typeof readMaziRetentionReviews>>|null=null;
 let inventory:Awaited<ReturnType<typeof maziRetentionInventory>>|null=null;
 try{[snapshot,inventory]=await Promise.all([readMaziRetentionReviews(principal),maziRetentionInventory(principal)]);}catch{}
 const {notice}=await searchParams;
 const reviewed=snapshot?MAZI_RETENTION_CATEGORIES.filter(c=>snapshot!.latest.find(r=>r.category_key===c.key)?.review_state==="evidence_recorded").length:0;
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>↗</span><Link href="/admin/mazi">ΜΑΖΙ</Link>
   <span>↗</span><Link href="/admin/mazi/operations">Επιχειρησιακός έλεγχος</Link><span>↗</span><span>RETENTION</span></div>
  <header className={s.hero}><div><p className={s.kicker}>GDPR ART. 5(1)(e), 17, 28, 30 · EVIDENCE REGISTER</p>
   <h1>Διατήρηση<span className={s.dot}>.</span><em>Έλεγχος ανά κατηγορία</em></h1>
   <p className={s.subtitle}>Πραγματική απογραφή πηγών και τεκμηρίων με 12 ανεξάρτητες κατηγορίες. Δεν εκτελούνται διαγραφές, δεν τροποποιούνται δεδομένα μελών και δεν τεκμαίρεται νομική έγκριση από την καταχώριση.</p>
  </div><div className={s.lock}><strong>PRODUCTION · REVIEW ONLY</strong>
   <span>Καταγεγραμμένες ανθρώπινες δηλώσεις, όχι αυτόματη νομική πιστοποίηση.</span>
   <a href="https://mazi.kontamou.site/legal/retention" target="_blank" rel="noreferrer">Δημοσιευμένη πολιτική ↗</a>
   <Link href="/admin/mazi/privacy-requests">Αιτήματα δικαιωμάτων GDPR ↗</Link>
  </div></header>
  {notice==="recorded"?<p className={s.notice} role="status">Η απόφαση αποθηκεύτηκε στο αμετάβλητο ιστορικό. Η γενική έγκριση νομικής συμμόρφωσης δεν μεταβλήθηκε.</p>:null}
  {notice==="invalid"?<p className={s.notice} role="alert">Μη έγκυρη δήλωση. Απαιτούνται όλα τα πραγματικά τεκμήρια, αναφορά και αναλυτική τεκμηρίωση.</p>:null}
  <section className={s.section}><div className={s.sectionTop}><div><p>01 / COVERAGE</p><h2>Κατάσταση απογραφής</h2></div>
   <span>Έλεγχοι: {snapshot?reviewed+" / "+MAZI_RETENTION_CATEGORIES.length:"μη διαθέσιμοι"}</span></div>
   {!snapshot||!inventory?<p className={s.empty} role="alert">Η πραγματική βάση ή ο κατάλογος τεκμηρίων δεν είναι διαθέσιμος. Δεν εμφανίζουμε ψευδή ολοκλήρωση.</p>:
    <div className={s.card}><div><strong>Πηγές από τη βάση</strong>
     <p className={s.body}>Αιτήσεις σε αναμονή: {inventory.awaiting_review} · Μη χρησιμοποιημένες προσκλήσεις: {inventory.unused_invitations} · Μηνύματα: {inventory.community_messages} · Ελεγκτικά συμβάντα: {inventory.immutable_audit_rows}</p>
     <p className={s.meta}>Απουσιάζοντες ονομασμένοι πίνακες: {snapshot.missingSources.length?snapshot.missingSources.join(", "):"κανένας"}</p>
     <p className={s.meta}>Νέοι / αταξινόμητοι πίνακες MAZI: {snapshot.unmappedSources.length?snapshot.unmappedSources.join(", "):"κανένας από τους πραγματικούς πίνακες"}</p>
     <p className={s.body}><strong>Μόνο ενημερωτική απογραφή:</strong> τα χρονικά όρια της δημοσιευμένης πολιτικής δεν ισοδυναμούν με ενεργή διαγραφή, συμφωνία με τους παρόχους ή εξουσιοδότηση δημοσίευσης.</p>
    </div></div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / PER-CATEGORY AUDIT</p><h2>Έλεγχος και αποδεικτικά</h2></div>
   <span>Επανέναρξη ακυρώνει το τελευταίο σημείο τεκμηρίωσης, όχι το ιστορικό.</span></div>
   {!snapshot?<p className={s.empty}>Μη διαθέσιμος έλεγχος.</p>:
   <div className={s.stack}>{MAZI_RETENTION_CATEGORIES.map((c,i)=>{
    const latest=snapshot!.latest.find(x=>x.category_key===c.key);
    return <article className={s.card} key={c.key}>
     <div style={{flex:1,minWidth:220}}>
      <span className={s.tag}>{String(i+1).padStart(2,"0")} / {latest?.review_state==="evidence_recorded"?"ΤΕΚΜΗΡΙΩΘΗΚΕ ΑΝΘΡΩΠΙΝΟΣ ΕΛΕΓΧΟΣ":"ΕΚΚΡΕΜΕΙ ΠΡΑΓΜΑΤΙΚΗ ΤΕΚΜΗΡΙΩΣΗ"}</span>
      <h3>{c.title}</h3><p className={s.body}>{c.focus}</p>
      <p className={s.meta}>Βάση: {c.sources.length?c.sources.join(" · "):"Εξωτερικοί πάροχοι / cookies / αποθηκευτικά μέσα — απαιτείται πραγματική καταγραφή"}</p>
      {latest?<p className={s.meta}>Τελευταίο γεγονός: {new Date(latest.recorded_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})} · Αναφορά: {latest.evidence_reference}</p>:null}
      {latest?<p className={s.body}>{latest.review_summary}</p>:null}
     </div>
     <form action={recordMaziRetentionReviewAction} className={s.action} style={{display:"grid",gap:10,minWidth:240,maxWidth:460,width:"100%"}}>
      <input type="hidden" name="csrf" value={principal.csrfToken}/>
      <input type="hidden" name="category_key" value={c.key}/>
      <fieldset style={{border:"1px solid #bac7b9",padding:12,margin:0,display:"grid",gap:10}}>
       <legend style={{fontWeight:700,fontSize:12}}>Απαιτήσεις πριν από τεκμηρίωση</legend>
       {MAZI_RETENTION_CHECKS.map(check=><label key={check.id} style={{display:"flex",gap:9,alignItems:"start",fontSize:12}}>
        <input type="checkbox" name="review_checks" value={check.id}/><span>{check.label}</span>
       </label>)}
      </fieldset>
      <label className={s.field}>Εσωτερική αναφορά αποδεικτικών (όχι προσωπικά δεδομένα)
       <input name="evidence_reference" required minLength={12} maxLength={180} pattern="[A-Za-z0-9_./:#-]+"
        placeholder="LEGAL-AUDIT-20261028-CATEGORY-01"/></label>
      <label className={s.field}>Πραγματικά ευρήματα και εκκρεμότητες (40–600 χαρακτήρες)
       <textarea name="review_summary" required minLength={40} maxLength={600} rows={4}
        placeholder="Ημερομηνία, πραγματικός έλεγχος, εκδόσεις και αποτέλεσμα. Χωρίς προσωπικά δεδομένα."/></label>
      <div className={s.buttons}>
       <button type="submit" name="state" value="evidence_recorded" className={s.primary}>Καταχώριση πραγματικού ελέγχου</button>
       <button type="submit" name="state" value="reopened" className={s.secondary}>Επανέναρξη / ανάκληση</button>
      </div>
     </form>
    </article>;
   })}</div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>03 / IMMUTABLE HISTORY</p><h2>Ιστορικό τεκμηρίωσης</h2></div></div>
   {snapshot&&snapshot.history.length?<div className={s.stack}>{snapshot.history.map(item=><div key={item.id} className={s.card}>
    <div><strong>{item.category_key} · {item.review_state}</strong>
    <p className={s.meta}>{new Date(item.recorded_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})} · {item.evidence_reference}</p>
    <p className={s.body}>{item.review_summary}</p></div>
   </div>)}</div>:<p className={s.empty}>Καμία τεκμηριωμένη ανθρώπινη βεβαίωση.</p>}
  </section>
  <p className={s.disclaimer}>Το πλήρες νομικό gate παραμένει χωριστό. Δεν επιτρέπεται θετική βεβαίωση πριν καλυφθούν όλες οι κατηγορίες με πραγματικά αποδεικτικά και τις λοιπές απαιτήσεις του νομικού ελέγχου.</p>
 </div></main>;
}

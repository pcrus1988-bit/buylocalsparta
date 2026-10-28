import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {readMaziBreachRegister,MAZI_BREACH_RISKS,MAZI_SUBJECT_EXCEPTIONS} from "../../../../lib/mazi-breach-response";
import {createMaziBreachCaseAction,updateMaziBreachCaseAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · GDPR περιστατικά · Super Admin",robots:{index:false,follow:false}};
const riskNames:Record<string,string>={
 pending:"Εκκρεμεί πραγματική εκτίμηση",not_personal_data:"Δεν διαπιστώθηκε παραβίαση προσωπικών δεδομένων",
 unlikely_risk:"Παραβίαση — απίθανος κίνδυνος (τεκμηριωμένος)",
 risk:"Κίνδυνος — απαιτείται κρίση/γνωστοποίηση Αρχής",
 high_risk:"Υψηλός κίνδυνος — Αρχή και ενημέρωση υποκειμένων ή ειδική εξαίρεση"
};
const actions=[
 {key:"assessed",label:"Πραγματική εκτίμηση κινδύνου"},
 {key:"authority_notified",label:"Πραγματική γνωστοποίηση στην ΑΠΔΠΧ"},
 {key:"subjects_notified",label:"Πραγματική ενημέρωση υποκειμένων"},
 {key:"subjects_exception",label:"Τεκμηριωμένη εξαίρεση άρθρου 34(3)"},
 {key:"closed",label:"Κλείσιμο μετά τις απαιτούμενες ενέργειες"},
 {key:"reopened",label:"Επανέναρξη"}
];
const exceptionNames:Record<string,string>={
 effective_protection:"Κατάλληλα προληπτικά μέτρα προστασίας (34(3)(α))",
 subsequent_measures:"Επακόλουθα μέτρα εξάλειψης υψηλού κινδύνου (34(3)(β))",
 disproportionate_effort:"Δυσανάλογη προσπάθεια και ισοδύναμη δημόσια ενημέρωση (34(3)(γ))"
};
const localTime=(d:Date|string|null)=>d?new Date(d).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"—";
export default async function MaziBreachDashboard({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><section className={s.denied}>
  <h1>Μόνο Super Admin</h1><p>Απαγορεύεται η πρόσβαση σε περιστατικά ασφάλειας άλλων ρόλων.</p>
 </section></main>;
 let data:Awaited<ReturnType<typeof readMaziBreachRegister>>|null=null;
 try{data=await readMaziBreachRegister(principal);}catch{}
 const notice=(await searchParams).notice;
 const now=Date.now();
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>↗</span>
   <Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span>
   <Link href="/admin/mazi/operations">Επιχειρησιακός έλεγχος</Link><span>↗</span><span>ART.33/34</span></div>
  <header className={s.hero}><div>
   <p className={s.kicker}>GDPR ARTICLES 33–34 · RESTRICTED INTERNAL REGISTER</p>
   <h1>Περιστατικά<span className={s.dot}>.</span><em>Παραβίαση προσωπικών δεδομένων</em></h1>
   <p className={s.subtitle}>Αποδεικτικό πραγματικής γνώσης, εκτίμηση κινδύνου, χρονικό όριο των 72 ωρών και χειροκίνητη τεκμηρίωση των απαιτούμενων γνωστοποιήσεων. Κάθε απόφαση διατηρεί αμετάβλητο ιστορικό.</p>
  </div><div className={s.lock}>
   <strong>ΔΕΝ ΑΠΟΣΤΕΛΛΕΤΑΙ ΑΥΤΟΜΑΤΗ ΓΝΩΣΤΟΠΟΙΗΣΗ</strong>
   <span>Ο υπεύθυνος επεξεργασίας αναλαμβάνει την πραγματική εκτίμηση και την εμπρόθεσμη γνωστοποίηση. Το μητρώο δεν υποκαθιστά την υποβολή στην Αρχή ούτε αποτελεί νομική γνώμη.</span>
   <a href="https://www.dpa.gr/el/foreis/asfaleia_dedomenwn/gnwstopoiisi_paraviasis" target="_blank" rel="noreferrer">ΑΠΔΠΧ · Οδηγίες γνωστοποίησης ↗</a>
  </div></header>
  {notice==="invalid"?<p className={s.notice} role="alert">Η ενέργεια απορρίφθηκε. Έλεγξε την ακριβή ώρα με ζώνη UTC, τα αληθινά τεκμήρια, τον κίνδυνο, την απαιτούμενη γνωστοποίηση και τυχόν καθυστέρηση.</p>:null}
  {notice==="created"?<p className={s.notice} role="status">Καταχωρίστηκε πραγματικό περιστατικό, χωρίς αυτόματη γνωστοποίηση ή ισχυρισμό ότι έγινε εκτίμηση.</p>:null}
  {notice==="updated"?<p className={s.notice} role="status">Καταχωρίστηκε η πραγματική ενέργεια με αμετάβλητο αποδεικτικό γεγονός.</p>:null}
  <section className={s.section}><div className={s.sectionTop}><div><p>01 / DEADLINES</p><h2>Ανοιχτές εκκρεμότητες</h2></div>
   <span>Η προθεσμία υπολογίζεται από τη στιγμή γνώσης, όχι την ώρα εισαγωγής εδώ</span></div>
   {!data?<p role="alert" className={s.empty}>Αδυναμία ανάγνωσης του προστατευμένου μητρώου. Δεν εμφανίζονται ψευδή μηδενικά.</p>:
   <div className={s.stats} style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))"}}>
    <div><small>ΣΥΝΟΛΟ ΕΓΓΡΑΦΩΝ</small><strong>{data.stats.total}</strong><span>Όχι απόδειξη απουσίας εξωτερικών περιστατικών</span></div>
    <div><small>ΕΚΚΡΕΜΗΣ ΕΚΤΙΜΗΣΗ</small><strong>{data.stats.pending_assessment}</strong><span>Χρήζουν αξιολόγησης</span></div>
    <div><small>ΓΝΩΣΤΟΠΟΙΗΣΕΙΣ ΑΡΧΗΣ</small><strong>{data.stats.reportable_unnotified}</strong><span>Κίνδυνος ή υψηλός κίνδυνος χωρίς καταγεγραμμένη γνωστοποίηση</span></div>
    <div><small>ΠΑΡΕΛΘΟΝ 72ΩΡΟ</small><strong>{data.stats.reportable_overdue}</strong><span>Μη καταγεγραμμένη γνωστοποίηση και παρέλευση στόχου</span></div>
    <div><small>ΥΨΗΛΟΣ ΚΙΝΔΥΝΟΣ</small><strong>{data.stats.high_risk_subject_action_pending}</strong><span>Ενέργεια προς τα υποκείμενα εκκρεμεί</span></div>
   </div>}
   <p className={s.disclaimer}>Άρθρο 33: όπου απαιτείται, γνωστοποίηση χωρίς αδικαιολόγητη καθυστέρηση και, ει δυνατόν, εντός 72 ωρών από τη γνώση· σε καθυστερημένη γνωστοποίηση απαιτείται αιτιολόγηση. Άρθρο 34: ενημέρωση ατόμων χωρίς αδικαιολόγητη καθυστέρηση σε υψηλό κίνδυνο, εκτός νομίμως τεκμηριωμένης εξαίρεσης. Το εσωτερικό μητρώο απαιτεί πραγματικό εξωτερικό αποδεικτικό.</p>
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / INTAKE</p><h2>Νέα πραγματική αναφορά</h2></div><span>Μην δημιουργείς δοκιμαστικά περιστατικά στην παραγωγή</span></div>
   {data?<form action={createMaziBreachCaseAction} className={s.card} style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))"}}>
    <input type="hidden" name="csrf" value={principal.csrfToken}/>
    <label className={s.field}>Ακριβής στιγμή πραγματικής γνώσης (ISO 8601 με UTC offset)
     <input name="aware_at" type="text" required maxLength={25}
      placeholder="2026-10-28T11:40:00+02:00"/></label>
    <label className={s.field}>Αποδεικτικό αναφοράς, όχι όνομα, email ή logs
     <input name="evidence_ref" type="text" required minLength={12} maxLength={180}
      pattern="[A-Za-z0-9_./:#-]+" placeholder="SECURITY-INCIDENT-20261028-01"/></label>
    <button type="submit" className={s.primary}>Καταχώριση αληθινού περιστατικού</button>
   </form>:null}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>03 / RESPONSE</p><h2>Διερεύνηση και αποδεικτικά</h2></div>
   <span>Κάθε ενέργεια επιβεβαιώνει μόνο πραγματικό εξωτερικό γεγονός</span></div>
   {data?.cases.length?<div className={s.stack}>{data.cases.map(record=>{
    const reportable=["risk","high_risk"].includes(record.risk_assessment);
    const overdue=record.case_status==="open"&&reportable&&!record.authority_notified_at&&
     new Date(record.deadline_at).getTime()<now;
    return <article key={record.id} className={s.card}>
     <div style={{flex:1,minWidth:240}}>
      <span className={s.tag}>{record.case_ref} · {record.case_status==="open"?"ΑΝΟΙΧΤΟ":"ΚΛΕΙΣΤΟ"}</span>
      <h3>{riskNames[record.risk_assessment]}</h3>
      <p className={s.meta}>Πραγματική γνώση: {localTime(record.aware_at)} · 72ωρο: {localTime(record.deadline_at)} {overdue?" · ΕΚΠΡΟΘΕΣΜΗ ΕΚΚΡΕΜΟΤΗΤΑ":""}</p>
      <p className={s.meta}>Αρχή: {localTime(record.authority_notified_at)} · Ενημέρωση ατόμων: {localTime(record.subjects_notified_at)}</p>
      <p className={s.meta}>Εξαίρεση άρθ. 34: {record.subjects_exception?exceptionNames[record.subjects_exception]:"—"} · Πηγή: {record.source_reference}</p>
      {data.events.filter(e=>e.case_id===record.id).slice(0,10).map((ev,i)=><p className={s.meta} key={i}>
       {ev.event_kind} · {ev.event_ref} · {ev.risk_assessment||ev.subjects_exception||""} · πραγματικός χρόνος: {localTime(ev.effective_at)} · καταχώριση: {localTime(ev.recorded_at)}
      </p>)}
     </div>
     <form action={updateMaziBreachCaseAction} className={s.action} style={{display:"grid",gap:10,width:"100%",minWidth:250,maxWidth:400}}>
      <input type="hidden" name="csrf" value={principal.csrfToken}/>
      <input type="hidden" name="case_id" value={record.id}/>
      <label className={s.field}>Πραγματική ενέργεια
       <select name="action" required>{actions.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select>
      </label>
      <label className={s.field}>Αξιολόγηση (μόνο για εκτίμηση)
       <select name="risk" defaultValue=""><option value="">Δεν αφορά</option>
        {MAZI_BREACH_RISKS.map(r=><option key={r} value={r}>{riskNames[r]}</option>)}
       </select></label>
      <label className={s.field}>Ακριβής ώρα πραγματικής γνωστοποίησης (μόνο για γνωστοποίηση)
       <input type="text" name="effective_at" maxLength={25} placeholder="2026-10-28T12:00:00+02:00"/></label>
      <label className={s.field}>Εξαίρεση άρθρου 34(3) (μόνο αν ισχύει πραγματικά)
       <select name="exception" defaultValue=""><option value="">Δεν αφορά</option>
        {MAZI_SUBJECT_EXCEPTIONS.map(x=><option key={x} value={x}>{exceptionNames[x]}</option>)}
       </select></label>
      <label className={s.field}>Αναφορά αιτιολογίας καθυστέρησης πέραν 72 ωρών
       <input type="text" name="late_reason_ref" maxLength={180} placeholder="LEGAL-DELAY-REASON-REF-001"/></label>
      <label className={s.field}>Αναφορά πραγματικού αποδεικτικού (όχι προσωπικά δεδομένα)
       <input type="text" name="evidence_ref" required minLength={12} maxLength={180}
        pattern="[A-Za-z0-9_./:#-]+" placeholder="CASE-EVIDENCE-20261028-001"/></label>
      <button type="submit" className={s.primary}>Καταχώριση πραγματικής ενέργειας</button>
     </form>
    </article>;
   })}</div>:<p className={s.empty}>Δεν υπάρχουν καταχωρισμένα περιστατικά σε αυτό το μητρώο. Αυτό δεν αποδεικνύει ότι δεν υπάρχουν εξωτερικά συμβάντα.</p>}
  </section>
 </div></main>;
}

import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {readMaziMarketingAdmin} from "../../../../lib/mazi-marketing-admin";
import {createMarketingBriefAction,transitionMarketingBriefAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Συλλογικό Marketing · Admin",robots:{index:false,follow:false}};
const channels:Record<string,string>={
 social:"Social media",search:"Αναζήτηση",marketplace:"KONTA ΜΟΥ",local_media:"Τοπικά ΜΜΕ",print:"Έντυπο",event:"Εκδήλωση"
};
const statusLabels:Record<string,string>={draft:"Προσχέδιο",review:"Προς εσωτερικό έλεγχο",archived:"Αρχειοθετήθηκε"};
const euro=(cents:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(Number(cents)/100);
const checks=[
 ["Σύμβαση, ΦΠΑ και εισπράξεις","Εγκεκριμένοι όροι, νόμιμα παραστατικά και επαληθευμένες εξοφλήσεις."],
 ["Marketing ledger & όρια","Χωριστό αμετάβλητο καθολικό, reconciliation, διαθέσιμο πραγματικό υπόλοιπο και hard spend cap."],
 ["Provider API και δικαιώματα","Εξουσιοδοτημένοι λογαριασμοί, άδειες δημιουργικού, δυνατότητα παύσης και ανεξάρτητος έλεγχος."],
 ["Δίκαιη επιλογή μελών","Επαλήθευση, συγκατάθεση συγκεκριμένων δημιουργικών, καταλληλότητα, κυκλική παρουσία και σύγκρουση συμφερόντων."],
 ["Πραγματικά αποτελέσματα","Εξακριβωμένα κόστη, διαθέσιμες μετρήσεις και συγκεντρωτική δημόσια λογοδοσία."]
] as const;
export default async function MaziMarketingAdmin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.denied}><h1>Πρόσβαση μόνο για τον Super Admin</h1><p>Η διαχείριση ΜΑΖΙ ανήκει αποκλειστικά στον KONTA ΜΟΥ Super Admin.</p></div></main>;
 let snapshot:Awaited<ReturnType<typeof readMaziMarketingAdmin>>|null=null;
 try{snapshot=await readMaziMarketingAdmin(principal);}catch{}
 const params=await searchParams;
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">KONTA ΜΟΥ / ADMIN</Link><span>↗</span><Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>MARKETING</span></div>
  <header className={s.hero}><div><p className={s.kicker}>SOLE SUPER ADMIN · MARKETING PLANNING</p>
   <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Συλλογική Προβολή</em></h1>
   <p className={s.subtitle}>Πραγματικός σχεδιασμός καμπανιών και προτιμήσεις μελών. Τα προσχέδια δεν αποτελούν εντολή διαφήμισης, νόμιμο κεφάλαιο ή δαπάνη.</p></div>
   <div className={s.lock}><strong>ΟΙΚΟΝΟΜΙΚΗ ΛΕΙΤΟΥΡΓΙΑ ΚΛΕΙΔΩΜΕΝΗ</strong><span>Δεν πραγματοποιούνται διαφημιστικές αγορές, χρεώσεις ή εκταμιεύσεις από αυτή την οθόνη.</span>
   <Link href="/admin/mazi/operations">Έλεγχοι λειτουργίας ↗</Link><a href="https://mazi.kontamou.site/transparency" target="_blank" rel="noreferrer">Δημόσια διαφάνεια ↗</a></div>
  </header>
  {params.notice==="created"?<p className={s.notice} role="status">Το προσχέδιο καταχωρίστηκε με ίχνος ελέγχου.</p>:null}
  {params.notice==="updated"?<p className={s.notice} role="status">Η κατάσταση του προσχεδίου ενημερώθηκε και καταγράφηκε.</p>:null}
  {params.notice==="invalid"?<p className={s.notice} role="alert">Έλεγξε τα όρια πεδίων και τις ημερομηνίες.</p>:null}
  <div className={s.stats} style={{gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))"}}>
   <div><small>ΕΓΚΥΡΑ ΠΡΟΣΧΕΔΙΑ</small><strong>{snapshot?snapshot.briefs.filter(b=>b.status==="draft").length:"—"}</strong><span>Καμία αυτόματη προώθηση</span></div>
   <div><small>ΕΣΩΤΕΡΙΚΟΣ ΕΛΕΓΧΟΣ</small><strong>{snapshot?snapshot.briefs.filter(b=>b.status==="review").length:"—"}</strong><span>Όχι ενεργή καμπάνια</span></div>
   <div><small>ΕΘΕΛΟΝΤΙΚΟ ΕΝΔΙΑΦΕΡΟΝ</small><strong>{snapshot?snapshot.membersInterested:"—"}</strong><span>{snapshot?String(snapshot.profilesTotal)+" αποθηκευμένες επιλογές":"Δεδομένα μη διαθέσιμα"}</span></div>
   <div className={s.fund}><small>ΕΓΚΕΚΡΙΜΕΝΟ MEDIA SPEND</small><strong>—</strong><span>Το καθολικό marketing δεν έχει ενεργοποιηθεί</span></div>
  </div>
  <section className={s.section}><div className={s.sectionTop}><div><p>01 / CAMPAIGN WORKSPACE</p><h2>Νέα καμπάνια · προσχέδιο</h2></div><span>Αποθήκευση σχεδιασμού, όχι αγορά διαφήμισης</span></div>
   {!snapshot?<p className={s.empty} role="status">Δεν είναι διαθέσιμη η σύνδεση με το μητρώο marketing. Δεν επιτρέπεται αποθήκευση ή εμφάνιση πλασματικών δεδομένων.</p>:
   <form action={createMarketingBriefAction} className={s.card} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:18}}>
    <input type="hidden" name="csrf" value={principal.csrfToken}/>
    <label className={s.field}>Τίτλος προσχεδίου<input name="title" required minLength={8} maxLength={140} placeholder="Π.χ. Τοπικές επιχειρήσεις Πελοποννήσου"/></label>
    <label className={s.field}>Κανάλι<select name="channel" required>{Object.entries(channels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className={s.field}>Περιοχή<input name="region" required minLength={2} maxLength={120} placeholder="Π.χ. Λακωνία"/></label>
    <label className={s.field}>Στόχευση κλάδων<input name="target_sector" required minLength={2} maxLength={120} placeholder="Π.χ. Λιανεμπόριο"/></label>
    <label className={s.field}>Ενδεικτικός προϋπολογισμός (€)<input name="proposed_budget_eur" type="number" required step="0.01" min="0" max="1000000" defaultValue="0"/></label>
    <label className={s.field}>Προτεινόμενη έναρξη<input name="starts_on" type="date"/></label>
    <label className={s.field}>Προτεινόμενη λήξη<input name="ends_on" type="date"/></label>
    <label className={s.field} style={{gridColumn:"1/-1"}}>Στόχος, κριτήρια και παραδοτέα<textarea name="objective" required minLength={30} maxLength={2000} rows={5} placeholder="Τι επιδιώκει η δράση, ποιο κοινό αφορά, πώς θα αξιολογηθεί;"/></label>
    <p className={s.disclaimer} style={{gridColumn:"1/-1",margin:0}}>Τα ποσά είναι ενδεικτικά, δεν αφαιρούνται από ταμείο και δεν παράγουν διαφημιστική ή οικονομική εντολή.</p>
    <button type="submit" className={s.primary} style={{justifySelf:"start"}}>Αποθήκευση προσχεδίου</button>
   </form>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / PIPELINE</p><h2>Πραγματικά προσχέδια</h2></div><span>Εσωτερική ακολουθία: προσχέδιο → έλεγχος → αρχειοθέτηση</span></div>
   {!snapshot?<p className={s.empty}>Μη διαθέσιμα δεδομένα.</p>:snapshot.briefs.length===0?<p className={s.empty}>Δεν υπάρχουν ακόμη προσχέδια. Μπορείς να καταχωρίσεις το πρώτο παραπάνω.</p>:
   <div className={s.stack}>{snapshot.briefs.map(b=><article className={s.card} key={b.id}>
    <div><span className={s.tag}>{channels[b.channel]||b.channel} · {statusLabels[b.status]||b.status}</span><h3>{b.title}</h3>
    <p className={s.body}>{b.objective}</p><p className={s.meta}>{b.region} · {b.target_sector} · Προτεινόμενο όριο: {euro(b.proposed_budget_cents)} · {b.starts_on||"Χωρίς έναρξη"} — {b.ends_on||"Χωρίς λήξη"}</p>
    <p className={s.meta}>Καταχώριση: {new Date(b.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</p></div>
    {b.status!=="archived"?<form action={transitionMarketingBriefAction} className={s.action} style={{display:"grid",gap:12,minWidth:210,alignContent:"start"}}>
     <input type="hidden" name="csrf" value={principal.csrfToken}/><input type="hidden" name="brief_id" value={b.id}/>
     <label className={s.field}>Κατάσταση
      <select name="status" defaultValue={b.status==="draft"?"review":"draft"}>
       <option value="review" disabled={b.status==="review"}>Προς εσωτερικό έλεγχο</option>
       <option value="draft" disabled={b.status==="draft"}>Επιστροφή σε προσχέδιο</option>
       <option value="archived">Αρχειοθέτηση</option>
      </select></label>
     <button type="submit" className={s.secondary}>Καταχώριση κατάστασης</button>
    </form>:<span className={s.tag}>ΟΡΙΣΤΙΚΟ ΑΡΧΕΙΟ</span>}
   </article>)}</div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>03 / MEMBER SIGNALS</p><h2>Εθελοντικές προτιμήσεις</h2></div><span>Μόνο συγκεντρωτικά στοιχεία και χωρίς προσωπικά δεδομένα</span></div>
   {snapshot?<div className={s.stack}>{snapshot.channelCounts.length?snapshot.channelCounts.map(x=><article key={x.channel} className={s.member}><div><strong>{channels[x.channel]||x.channel}</strong><span>Εθελοντικές θετικές δηλώσεις ενδιαφέροντος, όχι άδεια χρήσης δημιουργικών</span></div><strong>{x.count}</strong></article>):<p className={s.empty}>Δεν υπάρχουν ακόμα εθελοντικές προτιμήσεις μελών.</p>}</div>:<p className={s.empty}>Μη διαθέσιμα δεδομένα.</p>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>04 / FINANCIAL RELEASE GATES</p><h2>Πριν από πραγματική προβολή</h2></div><span>Κάθε όριο ελέγχεται ξεχωριστά πριν από δαπάνες</span></div>
   <div className={s.stack}>{checks.map(([title,desc],i)=><article className={s.member} key={title}><div><strong>{String(i+1).padStart(2,"0")} · {title}</strong><span>{desc}</span></div><span className={s.tag}>ΕΚΚΡΕΜΕΙ</span></article>)}</div>
   <p className={s.disclaimer}>Η οθόνη αυτή δεν επιτρέπει μεταφορές, χρεώσεις ή αγορές διαφημιστικού χρόνου. Τα ενδεικτικά budgets δεν είναι οικονομικά διαθέσιμα. Απαιτείται ενεργό και επαληθευμένο καθολικό πριν από οποιαδήποτε εξωτερική πληρωμή.</p>
   <div className={s.buttons}><Link className={s.secondary} href="/admin/mazi/operations">Επιχειρησιακός έλεγχος</Link></div>
  </section>
 </div></main>;
}

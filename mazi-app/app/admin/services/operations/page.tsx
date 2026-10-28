import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../../lib/supabase/server";
import {maziServiceRequest} from "../../../../lib/mazi-services-api";
import "../../../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"MAZI · Οικονομικός έλεγχος Tokens και λειτουργία υπηρεσιών",robots:{index:false,follow:false}};
type Period={
 period_id:string;member_user_id:string;starts_at:string;ends_at:string;
 invoice_reference:string;allowance:number;committed:number;reserved:number;
 completed:number;unallocated:number;request_count:number;
 phase:"active"|"expired"|"future";
};
type Summary={
 total_periods:number;active_periods:number;issued_tokens:number;
 committed_tokens:number;reserved_tokens:number;completed_tokens:number;
 available_active_tokens:number;expired_unused_tokens:number;
 future_allocated_tokens:number;overdrawn_periods:number;
};
type Requests={
 total_requests:number;waiting_requests:number;accepted_requests:number;
 in_progress_requests:number;completed_requests:number;cancelled_requests:number;
 rejected_requests:number;waiting_over_48_hours:number;open_over_14_days:number;
 missing_order_acceptances:number;completed_without_delivery:number;
 revisions_in_progress:number;
};
type Report={
 as_of:string;paid_enabled:boolean;legal_approved:boolean;
 accounting_approved:boolean;payment_verified:boolean;
 periods:Summary;requests:Requests;ledger_event_count:number;
 ledger_net_token_delta:number;ledger_difference_tokens:number;
 recent_periods:Period[];
};
const n=(value:number)=>new Intl.NumberFormat("el-GR").format(value||0);
const date=(s:string)=>new Date(s).toLocaleString("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"short"});
const state:Record<Period["phase"],string>={active:"Ενεργός",expired:"Έληξε",future:"Μελλοντικός"};

export default async function ServiceOperations(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziServiceRequest<{report:Report}>("admin_health");
 if(!result.ok){
  if(result.error==="not_authorized")redirect("/dashboard");
  return <main className="com-shell"><h1>Ο έλεγχος υπηρεσιών δεν είναι διαθέσιμος.</h1>
   <p>Δεν εμφανίζονται εκτιμήσεις ή παρωχημένα οικονομικά στοιχεία. Δοκίμασε ξανά όταν η υπηρεσία λειτουργεί.</p>
   <Link href="/admin/services" className="com-back">Πίσω στη διαχείριση υπηρεσιών ↗</Link></main>;
 }
 const h=result.report,p=h.periods,r=h.requests;
 const checks=[
  {label:"Νομικός έλεγχος",pass:h.legal_approved},
  {label:"Φορολογικός / λογιστικός έλεγχος",pass:h.accounting_approved},
  {label:"Επαληθευμένη ενσωμάτωση πληρωμών",pass:h.payment_verified},
  {label:"Ενεργοποίηση πληρωμένης συνδρομής",pass:h.paid_enabled}
 ];
 const alerts=[
  {title:"Αναμονή πάνω από 48 ώρες",count:r.waiting_over_48_hours,detail:"Αιτήσεις χωρίς ανάληψη"},
  {title:"Ανοιχτά πάνω από 14 ημέρες",count:r.open_over_14_days,detail:"Εσωτερική προειδοποίηση, όχι συμβατικό SLA"},
  {title:"Απουσία αποδοχής όρων",count:r.missing_order_acceptances,detail:"Αιτήματα χωρίς αποδεικτικό checkout"},
  {title:"Ολοκληρώσεις χωρίς παραδοτέο",count:r.completed_without_delivery,detail:"Έλεγχος τεκμηρίωσης"},
  {title:"Περίοδοι με υπέρβαση",count:p.overdrawn_periods,detail:"Δεσμεύσεις πάνω από τα εκδοθέντα Tokens"},
  {title:"Απόκλιση μητρώου Tokens",count:Math.abs(h.ledger_difference_tokens),detail:"Απόλυτη διαφορά κρατήσεων και εγγραφών κίνησης"}
 ];
 return <main id="content" className="com-shell">
  <header className="com-top"><div>
   <span className="com-kicker">MAZI / SUPER ADMIN / ΟΙΚΟΝΟΜΙΚΗ ΔΙΑΦΑΝΕΙΑ</span>
   <h1>Κάθε Token.<br/><em>Με λογοδοσία.</em></h1>
   <p>Πραγματική απογραφή από όλες τις εγγραφές πληρωμένων κύκλων, αιτημάτων και κινήσεων υπηρεσιών — όχι από τις 150 πρόσφατες εγγραφές της καθημερινής διαχείρισης.</p>
   <p className="com-meta">Στιγμιότυπο: {date(h.as_of)} · Μονάδα μέτρησης: Tokens, όχι ευρώ ταμείου.</p>
  </div><Link href="/admin/services" className="com-back">Αιτήματα & παραδόσεις ↗</Link></header>
  <section className="com-recent" aria-label="Εμπορική ετοιμότητα">
   <span className="com-kicker">01 / ΚΛΕΙΔΩΜΑ ΟΙΚΟΝΟΜΙΚΗΣ ΕΝΕΡΓΟΠΟΙΗΣΗΣ</span>
   <h2>{h.paid_enabled?"Το οικονομικό πρόγραμμα εμφανίζεται ενεργοποιημένο":"Η εμπορική ενεργοποίηση παραμένει κλειδωμένη"}</h2>
   <p>Η εμφάνιση κατάστασης έγκρισης καταγράφει μόνο την αντίστοιχη ύπαρξη στη βάση· δεν ισοδυναμεί με ανεξάρτητη νομική ή λογιστική γνωμοδότηση. Δεν παρέχεται δυνατότητα παράκαμψης του ελέγχου από αυτήν τη σελίδα.</p>
   <div className="com-dashboard-grid">
    {checks.map(c=><div className="com-card" key={c.label}>
     <span className="com-kicker">{c.pass?"ΚΑΤΑΧΩΡΙΣΜΕΝΟ":"ΣΕ ΕΚΚΡΕΜΟΤΗΤΑ"}</span>
     <h3>{c.label}</h3>
    </div>)}
   </div>
  </section>
  <section className="com-recent" aria-label="Συνολική συμφωνία Tokens">
   <span className="com-kicker">02 / ΣΥΜΦΩΝΙΑ ΠΡΟΓΡΑΜΜΑΤΟΣ</span><h2>Ισοζύγιο μονάδων υπηρεσιών</h2>
   <div className="com-stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))"}}>
    <div><span>Εκδοθέντα συνολικά</span><strong>{n(p.issued_tokens)}</strong><small>{n(p.total_periods)} καταγεγραμμένοι κύκλοι</small></div>
    <div><span>Δεσμευμένα συνολικά</span><strong>{n(p.committed_tokens)}</strong><small>Σε εργασία και ολοκληρωμένα</small></div>
    <div><span>Σε εξέλιξη</span><strong>{n(p.reserved_tokens)}</strong><small>Κρατήσεις μη τελικών αιτημάτων</small></div>
    <div><span>Ολοκληρωμένα</span><strong>{n(p.completed_tokens)}</strong><small>Σε υπηρεσίες που παραδόθηκαν</small></div>
    <div><span>Διαθέσιμα ενεργών κύκλων</span><strong>{n(p.available_active_tokens)}</strong><small>{n(p.active_periods)} ενεργοί κύκλοι</small></div>
    <div><span>Ληγμένα αχρησιμοποίητα</span><strong>{n(p.expired_unused_tokens)}</strong><small>Δεν μεταφέρονται</small></div>
    <div><span>Μελλοντικές παροχές</span><strong>{n(p.future_allocated_tokens)}</strong><small>Δεν είναι διαθέσιμες ακόμη</small></div>
   </div>
   <p className="com-meta">Το «δεσμευμένα συνολικά» περιλαμβάνει τις ολοκληρωμένες υπηρεσίες. Τα ληγμένα αχρησιμοποίητα υπολογίζονται από οριστικά υπόλοιπα περιόδων και δεν αποτελούν οφειλή ή μετρητά.</p>
   <p className="com-meta">Κινήσεις μητρώου: {n(h.ledger_event_count)} · Καθαρή μεταβολή: {n(h.ledger_net_token_delta)} Tokens · Διαφορά συμφωνίας: {n(h.ledger_difference_tokens)} Tokens.</p>
  </section>
  <section className="com-recent" aria-label="Λειτουργική εικόνα">
   <span className="com-kicker">03 / ΚΑΤΑΣΤΑΣΗ ΠΑΡΑΓΩΓΗΣ</span><h2>Πλήθος αιτημάτων σε όλη τη διάρκεια</h2>
   <div className="com-stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))"}}>
    <div><span>Σύνολο</span><strong>{n(r.total_requests)}</strong></div>
    <div><span>Προς έλεγχο</span><strong>{n(r.waiting_requests)}</strong></div>
    <div><span>Αναλήφθηκαν</span><strong>{n(r.accepted_requests)}</strong></div>
    <div><span>Σε εκτέλεση</span><strong>{n(r.in_progress_requests)}</strong></div>
    <div><span>Παραδόθηκαν</span><strong>{n(r.completed_requests)}</strong></div>
    <div><span>Ακυρώθηκαν / απορρίφθηκαν</span><strong>{n(r.cancelled_requests+r.rejected_requests)}</strong></div>
    <div><span>Διορθώσεις σε εξέλιξη</span><strong>{n(r.revisions_in_progress)}</strong></div>
   </div>
  </section>
  <section className="com-recent" aria-label="Έλεγχοι αποκλίσεων">
   <span className="com-kicker">04 / ΕΣΩΤΕΡΙΚΟΙ ΕΛΕΓΧΟΙ</span><h2>Σημεία που χρειάζονται προσοχή</h2>
   <div className="com-dashboard-grid">
    {alerts.map(a=><article key={a.title} className="com-card">
     <span className="com-kicker">{a.count===0?"ΧΩΡΙΣ ΕΝΔΕΙΞΗ":"ΑΠΑΙΤΕΙ ΕΛΕΓΧΟ"}</span>
     <h3>{a.title}</h3><p style={{fontSize:28,fontWeight:700}}>{n(a.count)}</p><p>{a.detail}</p>
    </article>)}
   </div>
  </section>
  <section className="com-recent" aria-label="Πρόσφατοι κύκλοι">
   <span className="com-kicker">05 / ΑΤΟΜΙΚΑ ΥΠΟΛΟΙΠΑ</span>
   <h2>Οι τελευταίοι 30 κύκλοι</h2>
   <p>Οι παρακάτω ατομικές εγγραφές είναι δείγμα πρόσφατων κύκλων για διερεύνηση· όλα τα σύνολα παραπάνω υπολογίζονται από το πλήρες μητρώο.</p>
   <div className="com-list">
    {h.recent_periods.map(v=><article key={v.period_id} className="com-card" style={{overflowWrap:"anywhere"}}>
     <div className="com-meta"><strong>{state[v.phase]}</strong><span>{date(v.starts_at)} — {date(v.ends_at)}</span></div>
     <p><strong>Μέλος:</strong> <code>{v.member_user_id}</code></p>
     <p><strong>Παραστατικό:</strong> {v.invoice_reference}</p>
     <p>{n(v.committed)} δεσμευμένα / {n(v.allowance)} εκδοθέντα · {n(v.reserved)} σε εργασία · {n(v.completed)} ολοκληρωμένα · {n(v.unallocated)} αδιάθετα · {n(v.request_count)} αιτήματα</p>
    </article>)}
    {!h.recent_periods.length?<p className="com-empty">Δεν έχουν εκδοθεί ακόμη εξοφλημένοι κύκλοι.</p>:null}
   </div>
  </section>
  <section className="com-recent"><span className="com-kicker">ΕΚΤΟΣ ΠΕΔΙΟΥ</span><h2>Τι δεν αποδεικνύουν αυτά τα νούμερα</h2>
   <p>Η εσωτερική συμφωνία Tokens δεν επιβεβαιώνει την είσπραξη της συνδρομής, τη σύνδεση με Mollie, την έκδοση παραστατικού στην ΑΑΔΕ, τον ΦΠΑ ή το πραγματικό κόστος εργασίας. Αυτά απαιτούν ανεξάρτητη επαληθευμένη διασύνδεση και λογιστικό έλεγχο πριν από εμπορική λειτουργία.</p>
  </section>
 </main>;

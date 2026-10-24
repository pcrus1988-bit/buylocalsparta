import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {maziOperationsSnapshot,type MaziOperationsSnapshot} from "../../../../lib/mazi-operations";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Ζωντανός επιχειρησιακός έλεγχος",robots:{index:false,follow:false}};

function Metric({index,title,value,detail}:{
 index:string;title:string;value:number;detail:string
}){
 return <div><small>{index} / {title}</small><strong>{value.toLocaleString("el-GR")}</strong><span>{detail}</span></div>;
}
function OperationalIssue({title,count,description}:{
 title:string;count:number;description:string
}){
 return <article className={s.member}>
  <div><strong>{title}</strong><span>{description}</span></div>
  <strong>{count.toLocaleString("el-GR")}</strong>
 </article>;
}
const date=(v:Date|null)=>v?new Date(v).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Δεν υπάρχει καταγεγραμμένο γεγονός";
export default async function MaziOperationsPage(){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))
  return <main className={s.stage}><section className={s.denied}>
    <h1>Πρόσβαση μόνο για τον Super Admin</h1>
    <p>Ο επιχειρησιακός έλεγχος του ΜΑΖΙ απαιτεί τον ενεργό ρόλο ΚΟΝΤΑ ΜΟΥ Super Admin.</p>
    <Link href="/admin">Επιστροφή στη διαχείριση</Link>
  </section></main>;
 let state:MaziOperationsSnapshot|null=null;
 try{state=await maziOperationsSnapshot(principal);}catch{}
 if(!state)return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>ΛΕΙΤΟΥΡΓΙΚΟΣ ΕΛΕΓΧΟΣ</span></div>
  <h1>Δεν είναι διαθέσιμα τα πραγματικά στοιχεία.</h1>
  <p>Δεν εμφανίζουμε προγενέστερα ή δοκιμαστικά νούμερα. Ελέγξτε τη σύνδεση με τη βάση και τον ενεργό Super Admin ρόλο.</p>
  <Link href="/admin/mazi">Επιστροφή στον χώρο διακυβέρνησης ↗</Link>
 </div></main>;
 const financeLocked=state.finance_enabled_cycles===0&&state.ledger_total===0&&
  state.grant_offers_total===0&&state.safe_founding_cycles===1;
 const auditCoherent=state.acceptances===state.invitations_consumed;
 const exceptions=state.invitations_delivery_unconfirmed+
   state.invitations_delivery_failed+state.invitations_expired_unconsumed+
   state.interest_registry_stale+(auditCoherent?0:1);
 const snapshotAt=new Date();
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin">ΚΟΝΤΑ ΜΟΥ / ADMIN</Link><span>↗</span>
   <Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>OPERATIONS</span></div>
  <header className={s.hero}>
   <div><p className={s.kicker}>SUPER ADMIN · LIVE DATABASE · READ ONLY</p>
    <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Έλεγχος λειτουργίας</em></h1>
    <p className={s.subtitle}>Πραγματική εικόνα εγγραφών, επαλήθευσης επιχειρήσεων, προσκλήσεων, διακυβέρνησης και οικονομικής ασφάλειας. Χωρίς εικονικά δεδομένα και χωρίς δυνατότητα εκταμίευσης.</p>
   </div>
   <div className={s.lock}><strong>ΣΤΙΓΜΙΟΤΥΠΟ ΒΑΣΗΣ</strong>
    <span>{snapshotAt.toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
    <span>Μόνο αναγνωστική πρόσβαση. Δεν δημιουργούνται ή αλλάζουν μέλη.</span>
    <Link href="/admin/mazi/interest">Διαχείριση αιτήσεων ΑΦΜ ↗</Link>
    <Link href="/admin/mazi">Διακυβέρνηση ↗</Link>
   </div>
  </header>

  <div className={s.stats}>
   <Metric index="01" title="ΕΝΔΙΑΦΕΡΟΝ" value={state.interest_total}
    detail={state.interest_pending+" προς αξιολόγηση · "+state.interest_approved+" εγκεκριμένες"}/>
   <Metric index="02" title="ΠΡΟΣΚΛΗΣΕΙΣ" value={state.invitations_total}
    detail={state.invitations_active+" ενεργές · "+state.invitations_consumed+" χρησιμοποιημένες"}/>
   <Metric index="03" title="ΜΕΛΗ" value={state.members_total}
    detail={state.members_kyb_verified+" με ΓΕΜΗ · "+state.members_voting_eligible+" δικαιώματα ψήφου"}/>
   <Metric index="04" title="ΕΚΚΡΕΜΟΤΗΤΕΣ" value={exceptions}
    detail="Χρειάζονται έλεγχο χειριστή, όχι αυτόματη επίλυση"/>
  </div>

  <section className={s.section}><div className={s.sectionTop}>
   <div><p>01 / ADMISSION & DELIVERY</p><h2>Προσκλήσεις και ασφάλεια</h2></div>
   <span>Μόνο εγκεκριμένες επιχειρήσεις · ατομική αποδοχή</span>
  </div>
   <div className={s.stack}>
    <OperationalIssue title="Αποστολές χωρίς επιβεβαίωση παρόχου" count={state.invitations_delivery_unconfirmed}
     description="Εκδόθηκαν πριν από 10 λεπτά και παραμένουν pending_delivery. Πρέπει να συμφωνηθούν χειροκίνητα με Supabase Auth."/>
    <OperationalIssue title="Αποτυχίες παράδοσης" count={state.invitations_delivery_failed}
     description="Απαιτείται καταγεγραμμένος έλεγχος της κατάστασης στον πάροχο πριν από νέα αποστολή."/>
    <OperationalIssue title="Ληγμένες χωρίς αποδοχή" count={state.invitations_expired_unconsumed}
     description="Η επανέκδοση απαιτεί ανάκληση της παλιάς πρόσκλησης με αιτιολογία."/>
    <OperationalIssue title="Εγκρίσεις με παλιό έλεγχο ΓΕΜΗ" count={state.interest_registry_stale}
     description="Η τελευταία επιβεβαίωση ΓΕΜΗ είναι παλαιότερη από επτά ημέρες. Δεν πρέπει να σταλεί πρόσκληση χωρίς νέο πραγματικό έλεγχο."/>
    <OperationalIssue title="Αποδοχές και χρησιμοποιημένες προσκλήσεις" count={Math.abs(state.acceptances-state.invitations_consumed)}
     description={auditCoherent?"Οι αμετάβλητες αποδοχές συμφωνούν με τις χρησιμοποιημένες προσκλήσεις.":"ΑΝΑΝΤΙΣΤΟΙΧΙΑ: ελέγξτε τη συναλλακτική καταχώριση πριν από νέες εντάξεις."}/>
   </div>
   <p className={s.disclaimer}>Το status «email_sent» επιβεβαιώνει μόνο αποδοχή της αποστολής από τον πάροχο και όχι παραλαβή στα εισερχόμενα. Δεν υπάρχουν αυτόματες επαναποστολές.</p>
   <Link className={s.primary} style={{display:"inline-block",marginTop:14}} href="/admin/mazi/interest">Άνοιγμα ελέγχου ΑΦΜ και προσκλήσεων ↗</Link>
  </section>

  <section className={s.section}><div className={s.sectionTop}>
   <div><p>02 / TRUST & DEMOCRACY</p><h2>Επαληθευμένη συμμετοχή</h2></div>
   <span>Χωρίς αυτόματη ενεργοποίηση ψήφου</span>
  </div>
   <div className={s.stats} style={{marginTop:0}}>
    <Metric index="01" title="ΕΠΑΛΗΘΕΥΣΗ ΓΕΜΗ" value={state.members_kyb_verified} detail="Επαληθευμένα στοιχεία επιχείρησης"/>
    <Metric index="02" title="ΔΙΚΑΙΩΜΑ ΨΗΦΟΥ" value={state.members_voting_eligible} detail="Με ανεξάρτητη διοικητική απόφαση"/>
    <Metric index="03" title="ΠΡΟΤΑΣΕΙΣ" value={state.proposals_total} detail="Πραγματικές εγγραφές στους κύκλους"/>
    <Metric index="04" title="ΨΗΦΟΔΕΛΤΙΑ" value={state.ballots_total} detail={state.members_suspended+" μέλη σε αναστολή"}/>
   </div>
   <p className={s.disclaimer}>Διατηρούνται {state.audit_events_total.toLocaleString("el-GR")} καταγεγραμμένα συμβάντα ελέγχου. Πιο πρόσφατο: {date(state.last_audit_at)}. Αυτή η σελίδα δεν εμφανίζει στοιχεία προσώπων ή περιεχόμενο αιτήσεων.</p>
  </section>

  <section className={s.section}><div className={s.sectionTop}>
   <div><p>03 / FINANCIAL SAFETY</p><h2>Δικλίδα Ταμείου Ανάπτυξης</h2></div>
   <span>Η διοικητική εικόνα δεν παρέχει δυνατότητα μεταφοράς χρημάτων</span>
  </div>
   <div className={s.card}>
    <div><span className={s.tag}>ΕΠΑΛΗΘΕΥΣΗ ΖΩΝΤΑΝΗΣ ΒΑΣΗΣ</span>
     <h3>{financeLocked?"Οικονομικές λειτουργίες κλειδωμένες":"ΑΠΑΙΤΕΙΤΑΙ ΑΜΕΣΟΣ ΕΛΕΓΧΟΣ"}</h3>
     <p className={s.body}>{financeLocked?
      "Ο ιδρυτικός κύκλος παραμένει μη οικονομικός. Δεν υπάρχουν ενεργοποιημένοι χρηματοδοτικοί κύκλοι, εγγραφές ταμείου ή προσφορές ενίσχυσης.":
      "Οι εγγραφές δεν συμφωνούν με την εγκεκριμένη μη οικονομική κατάσταση. Μην προχωρήσετε σε νέες προσκλήσεις ή οικονομικές ενέργειες πριν γίνει έλεγχος."}</p>
    </div>
    <div><p className={s.meta}>Ενεργοποιημένοι χρηματοδοτικοί κύκλοι: {state.finance_enabled_cycles}</p>
     <p className={s.meta}>Εγγραφές καθολικού: {state.ledger_total}</p>
     <p className={s.meta}>Προσφορές ενίσχυσης: {state.grant_offers_total}</p>
     <p className={s.meta}>Μη οικονομικός ιδρυτικός κύκλος: {state.safe_founding_cycles===1?"Επιβεβαιωμένος":"Μη επιβεβαιωμένος"}</p>
    </div>
   </div>
  </section>

  <section className={s.section}><div className={s.sectionTop}>
   <div><p>04 / EXTERNAL RELEASE GATES</p><h2>Πριν από δημόσια ένταξη</h2></div>
   <span>Οι παρακάτω έλεγχοι δεν πιστοποιούνται από τη βάση</span>
  </div>
   <div className={s.stack}>
    <OperationalIssue title="Supabase Auth email, SMTP και redirect" count={0}
     description="Εκκρεμεί εξωτερική επιβεβαίωση χρόνου ισχύος OTP, προτύπων email, παραλαβής και επιτρεπόμενης διεύθυνσης callback. Το 0 δεν δηλώνει ολοκλήρωση."/>
    <OperationalIssue title="Νομικός έλεγχος και διατήρηση δεδομένων" count={0}
     description="Εκκρεμεί ξεχωριστή έγκριση πριν από παραγωγική διάθεση της ροής εγγραφής και των μελλοντικών οικονομικών όρων."/>
    <OperationalIssue title="Πρώτη πραγματική δοκιμή ένταξης" count={0}
     description="Απαιτείται επιχείρηση με ρητή βούληση, πραγματικό ΑΦΜ/ΓΕΜΗ, έλεγχο εκπροσώπου, email και ρητή αποδοχή. Δεν χρησιμοποιούνται εικονικές εγγραφές."/>
   </div>
  </section>
 </div></main>;
}

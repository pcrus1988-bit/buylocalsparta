import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {maziOperationsSnapshot,maziLaunchGateStates,maziLaunchGateHistory,
 type MaziOperationsSnapshot,type MaziLaunchGateKey,type MaziLaunchGateReview
} from "../../../../lib/mazi-operations";
import {reviewMaziLaunchGateAction} from "./actions";
import {assessMaziReleaseReadiness} from "../../../../lib/mazi-readiness";
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
function ExternalGate({title,description,gateKey,review,csrf}:{
 title:string;description:string;gateKey:MaziLaunchGateKey;
 review:MaziLaunchGateReview|undefined;csrf:string;
}){
 const verified=review?.decision==="verified";
 return <article className={s.card}>
  <div style={{flex:1}}>
   <span className={s.tag}>{verified?"ΧΕΙΡΟΚΙΝΗΤΗ ΕΠΙΒΕΒΑΙΩΣΗ":"ΕΚΚΡΕΜΕΙ ΕΠΑΛΗΘΕΥΣΗ"}</span>
   <h3>{title}</h3>
   <p className={s.body}>{description}</p>
   <p className={s.meta}>{review?
    "Τελευταία απόφαση: "+new Date(review.recorded_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})+
     " · "+(verified?"επιβεβαιώθηκε":"άνοιξε ξανά"):
    "Δεν υπάρχει ακόμη υπογεγραμμένη απόφαση Super Admin."}</p>
  </div>
  <form action={reviewMaziLaunchGateAction} className={s.action}
   style={{display:"grid",gap:10,minWidth:270,maxWidth:390}}>
   <input type="hidden" name="csrf" value={csrf}/>
   <input type="hidden" name="gate_key" value={gateKey}/>
   <label className={s.tag} htmlFor={"gate-evidence-"+gateKey}>Τεκμηρίωση πραγματικού ελέγχου (40–1.200 χαρακτήρες)</label>
   <textarea id={"gate-evidence-"+gateKey} name="evidence" required minLength={40} maxLength={1200} rows={4}
    style={{font:"inherit",padding:12,border:"1px solid #adbdac"}}
    placeholder="Ημερομηνία, ελεγμένο πεδίο, αποτέλεσμα και πού τηρείται το σχετικό αποδεικτικό. Μην προσθέτετε στοιχεία πελατών ή μυστικά."/>
   <label style={{fontSize:12,display:"flex",gap:8,alignItems:"start"}}>
    <input type="checkbox" name="affirmed"/>
    <span>Επιβεβαιώνω ότι ολοκλήρωσα πραγματικά τον έλεγχο και έχω ελέγξιμα αποδεικτικά.</span>
   </label>
   <div className={s.buttons}>
    <button type="submit" name="decision" value="verified" className={s.primary}>Καταχώριση επιβεβαίωσης</button>
    <button type="submit" name="decision" value="reopened" className={s.secondary}>Επανέναρξη ελέγχου</button>
   </div>
  </form>
 </article>;
}
const gateLabels:Record<MaziLaunchGateKey,string>={
 auth_email_delivery:"Supabase Auth · email και redirect",
 legal_and_retention:"Νομικός έλεγχος και διατήρηση",
 consenting_business_e2e:"Πραγματική ένταξη επιχείρησης"
};
const date=(v:Date|null)=>v?new Date(v).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Δεν υπάρχει καταγεγραμμένο γεγονός";
export default async function MaziOperationsPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))
  return <main className={s.stage}><section className={s.denied}>
    <h1>Πρόσβαση μόνο για τον Super Admin</h1>
    <p>Ο επιχειρησιακός έλεγχος του ΜΑΖΙ απαιτεί τον ενεργό ρόλο ΚΟΝΤΑ ΜΟΥ Super Admin.</p>
    <Link href="/admin">Επιστροφή στη διαχείριση</Link>
  </section></main>;
 let state:MaziOperationsSnapshot|null=null;
 let gates:MaziLaunchGateReview[]=[];
 let gateHistory:MaziLaunchGateReview[]=[];
 try{[state,gates,gateHistory]=await Promise.all([
  maziOperationsSnapshot(principal),maziLaunchGateStates(principal),
  maziLaunchGateHistory(principal)
 ]);}catch{}
 if(!state)return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>ΛΕΙΤΟΥΡΓΙΚΟΣ ΕΛΕΓΧΟΣ</span></div>
  <h1>Δεν είναι διαθέσιμα τα πραγματικά στοιχεία.</h1>
  <p>Δεν εμφανίζουμε προγενέστερα ή δοκιμαστικά νούμερα. Ελέγξτε τη σύνδεση με τη βάση και τον ενεργό Super Admin ρόλο.</p>
  <Link href="/admin/mazi">Επιστροφή στον χώρο διακυβέρνησης ↗</Link>
 </div></main>;
 const {notice}=await searchParams;
 const latestGate=(key:MaziLaunchGateKey)=>gates.find(gate=>gate.gate_key===key);
 const assessment=assessMaziReleaseReadiness(state,gates);
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
  {notice==="gate_recorded"?<p className={s.notice} role="status">Η χειροκίνητη επαλήθευση καταχωρίστηκε στο αμετάβλητο ιστορικό. Δεν ενεργοποιήθηκε υπηρεσία ή πληρωμή.</p>:null}
  {notice==="gate_not_saved"?<p className={s.notice} role="alert">Δεν καταχωρίστηκε απόφαση. Ελέγξτε τα αποδεικτικά, την επιβεβαίωση και τον ενεργό Super Admin ρόλο.</p>:null}

  <section className={s.section} aria-label="Εκτίμηση ετοιμότητας έναρξης" style={{marginTop:32}}>
   <div className={s.sectionTop}>
    <div><p>PRE-RELEASE / LIVE DIAGNOSTICS</p><h2>Ετοιμότητα ελεγχόμενης έναρξης</h2></div>
    <span>Δεν είναι εξουσιοδότηση δημοσίευσης, εγγραφών ή οικονομικής ενεργοποίησης</span>
   </div>
   <div className={s.card}>
    <div style={{flex:1}}>
     <span className={s.tag}>ΤΕΚΜΗΡΙΩΜΕΝΟΙ ΕΛΕΓΧΟΙ: {assessment.evidenceGatesVerified}/{assessment.evidenceGatesTotal}</span>
     <h3>{assessment.prerequisitesRecorded?
      "Οι προϋποθέσεις έχουν καταγραφεί — απαιτείται ανεξάρτητη έγκριση δημοσίευσης":
      "Δεν έχουν ολοκληρωθεί όλοι οι απαιτούμενοι έλεγχοι"}</h3>
     <p className={s.body}>Η κατάσταση προκύπτει από πραγματικά στοιχεία της βάσης και τις τελευταίες βεβαιώσεις του Super Admin. Κάθε βεβαίωση είναι ανθρώπινη δήλωση, όχι αυτόματη απόδειξη συμμόρφωσης.</p>
     {assessment.blockers.length?<ul style={{marginTop:16,paddingLeft:20,lineHeight:1.8}}>
      {assessment.blockers.map((reason,i)=><li key={i}>{reason}</li>)}
     </ul>:<p className={s.body}>Δεν εντοπίστηκε εκκρεμότητα στους ελεγχόμενους δείκτες. Απαιτούνται ανεξάρτητη έγκριση και ελεγχόμενη δημοσίευση.</p>}
    </div>
    <div style={{minWidth:235}}>
     <p className={s.meta}>Οικονομική δικλίδα: {assessment.financeLocked?"κλειδωμένη":"ΑΠΟΚΛΙΣΗ"}</p>
     <p className={s.meta}>Συμφωνία αποδοχών: {assessment.invitationAuditCoherent?"ναι":"ΑΝΑΝΤΙΣΤΟΙΧΙΑ"}</p>
     <p className={s.meta}>Πραγματική επαληθευμένη ένταξη: {assessment.realBusinessAdmissionObserved?"παρατηρήθηκε":"ΔΕΝ ΠΑΡΑΤΗΡΗΘΗΚΕ"}</p>
     <p className={s.meta}>Εκκρεμότητες εντάξεων: {assessment.admissionExceptions}</p>
     <p className={s.meta}><strong>Δημοσίευση παραγωγής: απαιτεί ξεχωριστή έγκριση</strong></p>
    </div>
   </div>
  </section>

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
   <span>Μόνο ανθρώπινες βεβαιώσεις, καμία αυτόματη ενεργοποίηση</span>
  </div>
   <div className={s.stack}>
    <ExternalGate gateKey="auth_email_delivery" review={latestGate("auth_email_delivery")} csrf={principal.csrfToken}
     title="Supabase Auth email, SMTP και redirect"
     description="Ελέγξτε τον πραγματικό χρόνο λήξης OTP, τις δύο φόρμες email, παράδοση SMTP και το callback allowlist στο ίδιο Supabase project."/>
    <ExternalGate gateKey="legal_and_retention" review={latestGate("legal_and_retention")} csrf={principal.csrfToken}
     title="Νομικός έλεγχος και διατήρηση δεδομένων"
     description="Καταγράψτε τον πραγματικό νομικό έλεγχο, τις εκδόσεις όρων/ενημέρωσης και τον δημοσιευμένο χρόνο διατήρησης. Οι οικονομικοί όροι παραμένουν ανεξάρτητοι."/>
    <ExternalGate gateKey="consenting_business_e2e" review={latestGate("consenting_business_e2e")} csrf={principal.csrfToken}
     title="Πρώτη πραγματική δοκιμή ένταξης"
     description="Μόνο με συναινούσα πραγματική επιχείρηση: ΑΦΜ, ΓΕΜΗ, εκπροσώπηση, email, προσωπική πρόσκληση και ρητή αποδοχή. Όχι εικονικά μέλη."/>
   </div>
  </section>
  <section className={s.section}>
   <div className={s.sectionTop}>
    <div><p>05 / APPEND-ONLY EVIDENCE</p><h2>Ιστορικό ελέγχων</h2></div>
    <span>Τελευταίες 30 εγγραφές · χωρίς τροποποίηση ή διαγραφή</span>
   </div>
   {!gateHistory.length?<div className={s.empty}>Δεν υπάρχουν ακόμη βεβαιώσεις. Δεν θεωρούμε κανέναν εξωτερικό έλεγχο ολοκληρωμένο.</div>
   :<div className={s.stack}>{gateHistory.map(item=><article className={s.card} key={item.id}>
     <div style={{flex:1,minWidth:0}}>
      <span className={s.tag}>{gateLabels[item.gate_key]} · {item.decision==="verified"?"Επιβεβαιώθηκε":"Άνοιξε ξανά"}</span>
      <h3>{date(item.recorded_at)}</h3>
      <p className={s.body}>{item.evidence}</p>
     </div>
     <div><p className={s.meta}>Αμετάβλητη εγγραφή #{item.id}</p></div>
    </article>)}</div>}
   <p className={s.disclaimer}>Το ιστορικό είναι ιδιωτικό και προσβάσιμο αποκλειστικά στον Super Admin. Μην καταχωρίζετε προσωπικά δεδομένα, διαπιστευτήρια ή εμπιστευτικά έγγραφα.</p>
  </section>
 </div></main>;
}

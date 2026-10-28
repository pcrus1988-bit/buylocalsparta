import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {getAdminPostgresRuntime} from "../../../../lib/postgres-runtime";
import {isMaziSuperAdmin,marketplaceMaziActor} from "../../../../lib/mazi-superadmin";
import s from "../mazi.module.css";
export const metadata={title:"MAZI · Αναπτυξιακό Ταμείο · Εποπτεία",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
const cash=(v:string|number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(Number(v)/100);
type Totals={receipts:string;expenses:string;allocations:string;reversals:string;ledger_entries:string;last_entry_at:Date|null};
type Round={id:string;slug:string;title:string;kind:string;status:string;funding_budget_cents:string;finance_activated:boolean;starts_at:Date;ends_at:Date};
type Ledger={id:string;event_type:string;amount_cents:string;external_reference:string;created_at:Date;cycle_slug:string|null};
type OfferTotals={reserved_cents:string;offer_count:string};
type Offer={id:string;title:string;assigned_amount_cents:string;requested_amount_cents:string;additional_months:string;offered_at:Date;expires_at:Date};
type Recon={period_end:Date;statement_balance_cents:string;ledger_balance_cents:string;statement_sha256:string;reviewed_at:Date};
type Disclosure={id:string;kind:string;summary:string;amount_cents:string|null;published_at:Date};
type WorkQueue={status:string;total:string;total_requested_cents:string};
export default async function MaziFundAdmin(){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}>
   <h1>Πρόσβαση μόνο για Super Admin</h1><Link href="/admin">Επιστροφή</Link></div></main>;
 try{
  await marketplaceMaziActor(principal);
  const q=getAdminPostgresRuntime().nativePool;
  const [totals,rounds,ledger,offers,offerTotals,recons,disclosures,queue]=await Promise.all([
   q.query<Totals>(`select
     coalesce(sum(amount_cents) filter(where event_type='receipt'),0)::text receipts,
     coalesce(sum(amount_cents) filter(where event_type='expense'),0)::text expenses,
     coalesce(sum(amount_cents) filter(where event_type='allocation'),0)::text allocations,
     coalesce(sum(amount_cents) filter(where event_type='reversal'),0)::text reversals,
     count(*)::text ledger_entries,max(created_at) last_entry_at
     from public.mazi_fund_ledger`),
   q.query<Round>(`select id::text,slug,title,kind,status,funding_budget_cents::text,finance_activated,starts_at,ends_at
     from public.mazi_cycles order by created_at desc limit 25`),
   q.query<Ledger>(`select l.id::text,l.event_type,l.amount_cents::text,l.external_reference,l.created_at,c.slug cycle_slug
     from public.mazi_fund_ledger l left join public.mazi_cycles c on c.id=l.cycle_id
     order by l.created_at desc limit 60`),
   q.query<Offer>(`select o.id::text,p.title,o.assigned_amount_cents::text,o.requested_amount_cents::text,
     o.additional_months::text,o.offered_at,o.expires_at
     from public.mazi_grant_award_offers o join public.mazi_proposals p on p.id=o.proposal_id
     order by o.offered_at desc limit 60`),
   q.query<OfferTotals>(`select coalesce(sum(assigned_amount_cents),0)::text reserved_cents, count(*)::text offer_count
     from public.mazi_grant_award_offers`),
   q.query<Recon>(`select period_end,statement_balance_cents::text,ledger_balance_cents::text,
     statement_sha256,reviewed_at from public.mazi_fund_reconciliations order by period_end desc limit 12`),
   q.query<Disclosure>(`select id::text,kind,summary,amount_cents::text,published_at
     from public.mazi_fund_public_events order by published_at desc limit 50`),
   q.query<WorkQueue>(`select status,count(*)::text total,sum(amount_cents)::text total_requested_cents
     from public.mazi_proposals group by status order by status`)
  ]);
  const t=totals.rows[0];
  const balance=BigInt(t.receipts)-BigInt(t.expenses);
  const committed=BigInt(offerTotals.rows[0].reserved_cents);
  const unverified=t.reversals!=="0"||!recons.rows.length||
    BigInt(recons.rows[0].statement_balance_cents)!==balance;
  const realActive=rounds.rows.some(x=>x.kind==="fund_allocation"&&x.finance_activated);
  return <main className={s.stage}><div className={s.shell}>
   <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>→</span><Link href="/admin/mazi">ΜΑΖΙ</Link><span>→</span>ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ</div>
   <header className={s.hero}><div><p className={s.kicker}>MAZI / FINANCIAL CONTROL ROOM</p>
    <h1>Το Ταμείο.<em>Χωρίς κρυφά ποσά.</em></h1>
    <p className={s.subtitle}>Πραγματική εικόνα του καθολικού, των δεσμεύσεων, των ελεγμένων δημοσιεύσεων και των καταχωρισμένων συμφωνιών. Καμία δυνατότητα ενεργοποίησης πληρωμών από αυτή τη σελίδα.</p></div>
    <div className={s.lock}><strong>MARKETPLACE SUPER ADMIN ONLY</strong>
     <span>{realActive?"ΥΠΑΡΧΕΙ ΚΥΚΛΟΣ ΜΕ ΕΝΕΡΓΟΠΟΙΗΜΕΝΗ ΧΡΗΜΑΤΟΔΟΤΗΣΗ":"ΕΚΚΡΕΜΕΙ ΝΟΜΙΚΗ & ΟΙΚΟΝΟΜΙΚΗ ΕΝΕΡΓΟΠΟΙΗΣΗ"}</span>
     <a href="https://mazi.kontamou.site/fund/transparency" target="_blank" rel="noreferrer">Δημόσια διαφάνεια ↗</a><Link href="/admin/mazi/fund/governance">Ψηφοφορίες · έλεγχοι · οριστικοποίηση ↗</Link><Link href="/admin/mazi/fund/projects">Ελεγμένα έργα · τεκμήρια · ορόσημα ↗</Link>
    </div></header>
   <div className={s.stats}>
    <div><small>01 / ΕΙΣΡΟΕΣ ΣΤΟ ΒΙΒΛΙΟ</small><strong style={{fontSize:30}}>{cash(t.receipts)}</strong><span>{t.ledger_entries} εγγραφές</span></div>
    <div><small>02 / ΠΡΑΓΜΑΤΙΚΑ ΕΞΟΔΑ ΒΙΒΛΙΟΥ</small><strong style={{fontSize:30}}>{cash(t.expenses)}</strong><span>Χωρίς υπόθεση για τραπεζικό υπόλοιπο</span></div>
    <div><small>03 / ΔΕΣΜΕΥΣΕΙΣ ΠΡΟΣΦΟΡΩΝ</small><strong style={{fontSize:30}}>{cash(String(committed))}</strong><span>{offerTotals.rows[0].offer_count} συνολικές προσφορές</span></div>
    <div className={s.fund}><small>04 / ΛΟΓΙΣΤΙΚΟ ΥΠΟΛΟΙΠΟ</small><strong style={{fontSize:30}}>{cash(String(balance))}</strong><span>{unverified?"ΟΧΙ ΕΠΑΛΗΘΕΥΜΕΝΟ ΜΕ ΤΡΑΠΕΖΑ":"ΚΑΤΑΧΩΡΙΣΜΕΝΗ ΕΣΩΤΕΡΙΚΗ ΣΥΜΦΩΝΙΑ"}</span></div>
   </div>
   <section className={s.section}><div className={s.sectionTop}><div><p>01 / SAFETY GATES</p><h2>Έλεγχοι πριν από κάθε ευρώ</h2></div><span>Οικονομική κατάσταση: {realActive?"ενεργή":"ανενεργή"}</span></div>
    <div className={s.card} style={{display:"block"}}>
     <p>Πρόσθετες εγγραφές κατανομής: <strong>{cash(t.allocations)}</strong>. Αντιλογισμοί: <strong>{cash(t.reversals)}</strong>.
      Τα ποσά αυτά ΔΕΝ ταυτίζονται με τραπεζικές κινήσεις.</p>
     <p>Οικονομική ενεργοποίηση απαιτεί: ανεξάρτητη νομική/φορολογική γνωμοδότηση, ξεχωριστή τραπεζική φύλαξη ή κατάλληλη διαχείριση κεφαλαίων, αμετάβλητα παραστατικά, ελεγμένη συμφωνία λογαριασμού και εγκεκριμένη διαδικασία εκταμίευσης. Τα αντίστοιχα αποδεικτικά δεν επιβεβαιώνονται αυτόματα.</p>
     {unverified?<p role="alert"><strong>ΜΠΛΟΚΑΡΙΣΜΕΝΟ ΑΠΟΔΕΙΚΤΙΚΟ ΔΙΑΘΕΣΙΜΟ ΚΕΦΑΛΑΙΟ.</strong> Δεν υπάρχει πλήρης συμφωνία βιβλίου και δηλωμένης τραπεζικής κατάστασης ή υπάρχουν αντιλογισμοί.</p>:<p>Έχει καταχωριστεί συμφωνία. Χρειάζεται επιπλέον ανεξάρτητος έλεγχος πριν από πραγματική εκταμίευση.</p>}
    </div>
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>02 / GOVERNANCE CYCLES</p><h2>Κύκλοι και προϋπολογισμοί</h2></div><span>Δεν υπάρχουν αυτόματες κατανομές χρημάτων</span></div>
    {!rounds.rows.length?<div className={s.empty}>Δεν υπάρχουν πραγματικοί κύκλοι.</div>:<div className={s.stack}>{rounds.rows.map(c=><div className={s.member} key={c.id}>
    <div><strong>{c.title}</strong><span>{c.slug} · {c.kind} · {c.status}</span>
    <span>{new Date(c.starts_at).toLocaleDateString("el-GR")} — {new Date(c.ends_at).toLocaleDateString("el-GR")}</span></div>
    <strong>{cash(c.funding_budget_cents)} · {c.finance_activated?"Ενεργός":"Χωρίς χρηματοδότηση"}</strong></div>)}</div>}
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>03 / VOTING PIPELINE</p><h2>Αιτήματα ανά κατάσταση</h2></div><span>Πρώτη αίτηση: προτεραιότητα, όχι αυτόματο δικαίωμα χρηματοδότησης</span></div>
    {!queue.rows.length?<div className={s.empty}>Καμία υποβληθείσα πρόταση.</div>:queue.rows.map(a=><div className={s.member} key={a.status}><strong>{a.status} · {a.total} αιτήματα</strong><span>Αιτούμενα: {cash(a.total_requested_cents)}</span></div>)}
    <p className={s.disclaimer}>Μία επιχείρηση = μία έγκυρη ψήφος ανά κύκλο, με έλεγχο ΓΕΜΗ και συγκρούσεων. Η κατάταξη και η επαλήθευση οικονομικών προϋποθέσεων προηγούνται οποιασδήποτε προσφοράς.</p>
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>04 / FINANCIAL EVIDENCE</p><h2>Καθολικό και συμφωνίες</h2></div><span>Οι εγγραφές δεν διαγράφονται ούτε αντικαθίστανται</span></div>
    {!ledger.rows.length?<div className={s.empty}>Το οικονομικό καθολικό δεν περιέχει ακόμη πραγματικές κινήσεις.</div>:ledger.rows.map(x=><div className={s.member} key={x.id}>
     <div><strong>{x.event_type} · {x.external_reference}</strong><span>{new Date(x.created_at).toLocaleString("el-GR")} · Κύκλος: {x.cycle_slug||"—"}</span></div><strong>{cash(x.amount_cents)}</strong>
    </div>)}
    <h3 style={{marginTop:35}}>Καταχωρισμένες συμφωνίες</h3>
    {!recons.rows.length?<div className={s.empty}>Δεν υπάρχει καταχωρισμένη συμφωνία τραπεζικής κατάστασης.</div>:recons.rows.map(x=><div className={s.member} key={String(x.period_end)}>
     <div><strong>Έως {new Date(x.period_end).toLocaleDateString("el-GR")}</strong>
     <span>SHA-256 statement: {x.statement_sha256}</span></div><strong>{cash(x.statement_balance_cents)}</strong>
    </div>)}
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>05 / PUBLIC ACCOUNTABILITY</p><h2>Δημοσιεύσεις και διορθώσεις</h2></div><span>Μόνο επιμελημένες, μη προσωπικές περιλήψεις</span></div>
    {!disclosures.rows.length?<div className={s.empty}>Δεν έχουν δημοσιευτεί ακόμη εγγραφές δημόσιου απολογισμού.</div>:disclosures.rows.map(d=><div className={s.member} key={d.id}><div><strong>{d.kind} · {new Date(d.published_at).toLocaleDateString("el-GR")}</strong><span>{d.summary}</span></div><strong>{d.amount_cents===null?"—":cash(d.amount_cents)}</strong></div>)}
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>06 / INDIVIDUAL AWARDS</p><h2>Προσφορές και όροι</h2></div><span>Δεν αποτελούν πληρωμές</span></div>
    {!offers.rows.length?<div className={s.empty}>Δεν υπάρχουν εγκεκριμένες προσφορές ενίσχυσης.</div>:offers.rows.map(o=><div className={s.member} key={o.id}>
     <div><strong>{o.title}</strong><span>Αίτημα {cash(o.requested_amount_cents)} · Πρόσθετη συμμετοχή {o.additional_months} μήνες (με βάση το αιτούμενο ποσό)</span></div>
     <strong>{cash(o.assigned_amount_cents)}</strong></div>)}
   </section>
   <p className={s.disclaimer}>Οι ιδιωτικές οικονομικές πληροφορίες και τραπεζικές αναφορές είναι διαθέσιμες μόνο σε εξουσιοδοτημένη εποπτεία. Όλες οι δημόσιες διορθώσεις καταχωρίζονται ως νέα ιστορικά γεγονότα.</p>
  </div></main>;
 }catch{return <main className={s.stage}><div className={s.shell}>
   <h1>Η οικονομική εποπτεία δεν είναι διαθέσιμη</h1>
   <p>Αποτυχία ασφαλούς ανάκτησης δεδομένων. Δεν εμφανίζουμε μηδενικά ως πραγματική κατάσταση και δεν έγινε οικονομική ενέργεια.</p>
   <Link href="/admin/mazi">Επιστροφή</Link>
  </div></main>;}
}

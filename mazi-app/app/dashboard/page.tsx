import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,maziFundMemberRequest,maziPublicFundReport,type MaziState,type MaziFundBallotState} from "../../lib/mazi-api";
import {euroCents} from "../../lib/fund-transparency";
import {isInquiryUnread,type CommunityInbox} from "../../lib/community";
import type {MaziListing,MaziForumThread} from "../../lib/mazi-community";
import "../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ο προσωπικός πίνακας του μέλους",robots:{index:false,follow:false}};

type Overview={activity:{active_listings:number;threads:number;replies:number;chat_messages:number}};
const display=(value:number|undefined)=>value===undefined?"—":value.toLocaleString("el-GR");

export default async function Dashboard(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok)return <main id="content" className="com-shell">
   <h1>Ο προσωπικός χώρος δεν είναι διαθέσιμος.</h1>
   <p>Δεν έχει γίνει αλλαγή στον λογαριασμό σου.</p>
   <Link href="/members">Επιστροφή στα στοιχεία μέλους</Link>
 </main>;
 if(!state.application)redirect("/onboarding");
 const isVerified=state.application.status==="approved"&&
  state.member?.status==="verified"&&Boolean(state.member.identity_verified_at);
 const [overview,owned,forum,inbox]=isVerified?await Promise.all([
  maziMemberRequest<Overview>("community_overview"),
  maziMemberRequest<{listings:MaziListing[]}>("marketplace_my"),
  maziMemberRequest<{threads:MaziForumThread[]}>("forum_list"),
  maziMemberRequest<CommunityInbox>("community_inbox")
 ]):[null,null,null,null];
 const listings=owned?.ok?owned.listings:[];
 const threads=forum?.ok?forum.threads.filter(t=>t.member_user_id===user.id):[];
 const activity=overview?.ok?overview.activity:null;
 const conversations=inbox?.ok?inbox.inquiries:[];
 const inbound=conversations.filter(q=>q.recipient_user_id===user.id&&q.status==="open");
 const unread=conversations.filter(q=>isInquiryUnread(q,user.id));
 const [fundState,financeState]=await Promise.all([
  isVerified?maziFundMemberRequest<MaziFundBallotState>("state"):Promise.resolve(null),
  maziPublicFundReport()
 ]);
 const ownProposals=state.proposals.filter(p=>p.created_by===user.id);
 const cards=[
  {title:"Η συμμετοχή μου",label:"01 / ΕΠΙΧΕΙΡΗΣΗ",href:"/members",desc:"Αίτηση, επαλήθευση, πραγματική κατάσταση και διευκρινίσεις ελέγχου."},
  {title:"Αγορά φυσικών ειδών",label:"02 / ΑΓΟΡΑ",href:"/marketplace",desc:"Προσφέρω ή αναζητώ πραγματικά αγαθά: εξοπλισμό, αποθέματα, υλικά, με ιδιωτική επικοινωνία μελών."},
  {title:"Το Forum",label:"03 / ΚΟΙΝΟΤΗΤΑ",href:"/forum",desc:"Συζητήσεις, εμπειρία, συμβουλές και νέες επαγγελματικές συνεργασίες."},
  {title:"Livechat",label:"04 / ΣΥΝΟΜΙΛΙΑ",href:"/livechat",desc:"Συνομιλία με τις άλλες επαληθευμένες επιχειρήσεις της κοινότητας."},
  {title:"Ιδιωτικά μηνύματα",label:"05 / ΕΠΙΚΟΙΝΩΝΙΑ",href:"/inbox",desc:"Προσωπικά αιτήματα συνεργασίας και απαντήσεις για τις καταχωρίσεις σου."},
  {title:"Προτάσεις και ψηφοφορίες",label:"06 / ΣΥΜΜΕΤΟΧΗ",href:"/proposals",desc:"Παρακολούθηση πραγματικών προτάσεων, καταστάσεων και δικαιωμάτων."},
  {title:"Ενισχύσεις",label:"07 / ΑΝΑΠΤΥΞΗ",href:"/awards",desc:"Ατομικές προσφορές, όροι και καταγεγραμμένες αποδοχές. Χωρίς ενεργή εκταμίευση."},
  {title:"250 Tokens υπηρεσιών",label:"08 / ΥΠΗΡΕΣΙΕΣ",href:"/services",desc:"Κατάλογος, αιτήματα και υπόλοιπο του δικού σου μηνιαίου κύκλου. Η ενεργοποίηση απαιτεί επαληθευμένη πληρωμή."},
  {title:"Η συλλογική προβολή μου",label:"09 / MARKETING",href:"/dashboard/marketing",desc:"Σχεδιασμός καμπανιών και μελλοντική παρακολούθηση πραγματικής διαφημιστικής προβολής. Χωρίς ενεργές καμπάνιες."},
  {title:"Η διαφάνεια του Ταμείου",label:"10 / ΟΙΚΟΝΟΜΙΚΗ ΛΟΓΟΔΟΣΙΑ",href:"/fund/transparency",desc:"Εισροές, εκροές, δεσμεύσεις, λογιστικό υπόλοιπο, καταχωρισμένες συμφωνίες και δημόσια τεκμήρια."},
  {title:"Ψηφοφορία Αναπτυξιακού Ταμείου",label:"11 / ΔΗΜΟΚΡΑΤΙΚΗ ΕΠΙΛΟΓΗ",href:"/fund/vote",desc:"Ένα αμετάβλητο ψηφοδέλτιο ανά επαληθευμένη επιχείρηση, με δυνατότητα στήριξης πολλών έργων όταν ανοίξει ο χρηματοδοτικός κύκλος."},
  {title:"Αίτηση στο Αναπτυξιακό Ταμείο",label:"12 / ΧΡΗΜΑΤΟΔΟΤΙΚΗ ΠΡΟΤΑΣΗ",href:"/fund/apply",desc:"Προσωπική αίτηση με αιτούμενο ποσό, ελάχιστο χρήσιμο ποσό, τεκμηρίωση και όρους."}
 ];
 return <main id="content" className="com-shell">
   <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / Η ΕΠΙΧΕΙΡΗΣΗ ΜΟΥ</span>
    <h1>Μαζί,<br/><em>{state.application.business_name}.</em></h1>
    <p>Ο ατομικός πίνακας για τη συμμετοχή και τις πραγματικές συνεργασίες της επιχείρησής σου.</p>
   </div><Link href="/members" className="com-back">Τα στοιχεία μου ↗</Link></div>
   <div className="com-alert">{isVerified
     ?"Η επιχείρησή σου είναι επαληθευμένο μέλος. Οι λειτουργίες συνεργασίας απαιτούν ενεργή έγκριση."
     :"Οι δυνατότητες κοινότητας εμφανίζονται μετά από πραγματική έγκριση συμμετοχής και επαλήθευση ΓΕΜΗ."}
    {" "}Δεν έχουν ενεργοποιηθεί συνδρομές, χρεώσεις ή εκταμιεύσεις.
   </div>
   <section aria-label="Πραγματικές μετρήσεις της επιχείρησης" className="com-stats">
    <div><span>Κατάσταση μέλους</span><strong>{isVerified?"Επαληθευμένη":"Σε αξιολόγηση"}</strong>
      <small>{state.member?.admitted_at?"Από "+new Date(state.member.admitted_at).toLocaleDateString("el-GR"):"Χωρίς ενεργή οικονομική συμφωνία"}</small></div>
    <div><span>Οι προτάσεις μου</span><strong>{ownProposals.length}</strong><small>Στον τρέχοντα κύκλο</small></div>
    <div><span>Καταχωρίσεις ειδών</span><strong>{display(activity?.active_listings)}</strong><small>Πραγματικές καταχωρίσεις μου</small></div>
    <div><span>Θέματα Forum</span><strong>{display(activity?.threads)}</strong><small>Θέματα που έχω ανοίξει</small></div>
    <div><span>Αδιάβαστα μηνύματα</span><strong>{display(inbox?.ok?unread.length:undefined)}</strong><small>{inbound.length} ενεργά αιτήματα συνεργασίας</small></div>
   </section>
   <section className="com-recent" aria-label="Το Αναπτυξιακό Ταμείο μου">
    <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
     <div><span className="com-kicker">ΜΑΖΙ / BUSINESS GROWTH FUND</span><h2>Το Ταμείο στην επιχείρησή μου</h2></div>
     <Link href="/fund/transparency">Ο δημόσιος οικονομικός απολογισμός →</Link>
    </div>
    <div className="com-dashboard-grid" style={{marginTop:22}}>
     <article className="com-nav-card">
      <span>ΑΡΧΕΙΟ ΕΝΙΣΧΥΣΕΩΝ</span>
      <h3>{fundState?.ok&&fundState.my_proposal?"1 αίτηση":"Καμία χρηματοδοτική αίτηση"}</h3>
      <p>{fundState?.ok&&fundState.my_proposal?fundState.my_proposal.title+" · "+fundState.my_proposal.status:
       "Οι αιτήσεις αναπτυξιακής ενίσχυσης θα εμφανιστούν εδώ μόλις υπάρξει νόμιμα ενεργός χρηματοδοτικός κύκλος."}</p>
      <Link href="/fund/apply">Τα αιτήματά μου →</Link>
     </article>
     <article className="com-nav-card">
      <span>ΨΗΦΟΣ & ΔΙΑΚΥΒΕΡΝΗΣΗ</span>
      <h3>{fundState?.ok&&fundState.has_voted?"Η ψήφος καταχωρίστηκε":
       fundState?.ok&&fundState.cycle?.status==="voting"&&fundState.voting_eligible?"Ανοιχτή ψηφοφορία":"Δεν υπάρχει ανοιχτή ψηφοφορία"}</h3>
      <p>{fundState?.ok&&fundState.my_vote?"Στήριξες "+fundState.my_vote.proposal_ids.length+" προτάσεις.":
        "Μία έγκυρη ψήφος ανά επαληθευμένη επιχείρηση και κύκλο."}</p>
      <Link href="/fund/vote">Οι ψηφοφορίες μου →</Link>
     </article>
     <article className="com-nav-card">
      <span>ΟΙΚΟΝΟΜΙΚΗ ΛΟΓΟΔΟΣΙΑ</span>
      <h3>{financeState?euroCents(financeState.book_cash_balance_cents):"Μη διαθέσιμο"}</h3>
      <p>{financeState
        ?financeState.financial_operations_enabled
          ?"Λογιστικό υπόλοιπο (όχι επιβεβαιωμένο τραπεζικό υπόλοιπο)."
          :"Ανενεργό Ταμείο · χωρίς ενεργή χρηματοδότηση."
        :"Δεν επιβεβαιώθηκε η σύνδεση με τα οικονομικά στοιχεία. Δεν προβάλλουμε εικονικό μηδενικό υπόλοιπο."}</p>
      <Link href="/fund/transparency">Αναλυτική διαφάνεια →</Link>
     </article>
    </div>
   </section>
   <nav aria-label="Εργαλεία της επιχείρησης" className="com-dashboard-grid">
    {cards.map(card=><Link key={card.href} href={isVerified||card.href==="/members"||card.href==="/fund/transparency"?card.href:"/members"} className="com-nav-card">
      <span>{card.label}</span><h2>{card.title} ↗</h2><p>{card.desc}</p>
    </Link>)}
   </nav>
   <section className="com-recent"><h2>Η δραστηριότητά μου</h2>
    {conversations.length||ownProposals.length||listings.length||threads.length?
     <div className="com-list">
      {conversations.slice(0,3).map(q=><article className="com-card" key={q.id}>
       <span className="com-kicker">ΙΔΙΩΤΙΚΗ ΣΥΝΕΡΓΑΣΙΑ · {isInquiryUnread(q,user.id)?"ΑΔΙΑΒΑΣΤΟ":q.status==="open"?"ΕΝΕΡΓΗ":"ΚΛΕΙΣΤΗ"}</span>
       <h3>{inbox?.ok?inbox.listing_labels[q.listing_id]||"Αίτημα συνεργασίας":"Αίτημα συνεργασίας"}</h3>
       <p>{inbox?.ok?inbox.businesses[q.sender_user_id===user.id?q.recipient_user_id:q.sender_user_id]||"Επαληθευμένη επιχείρηση":"Επαληθευμένη επιχείρηση"}</p>
       <Link href="/inbox">Άνοιγμα συνομιλίας →</Link>
      </article>)}
      {ownProposals.slice(0,3).map(p=><article className="com-card" key={p.id}>
       <span className="com-kicker">ΠΡΟΤΑΣΗ · {p.status}</span><h3>{p.title}</h3>
       <Link href="/proposals">Οι προτάσεις μου →</Link>
      </article>)}
      {listings.slice(0,3).map(l=><article className="com-card" key={l.id}>
       <span className="com-kicker">MARKETPLACE · {l.status}</span><h3>{l.title}</h3>
       <Link href="/marketplace">Οι καταχωρίσεις μου →</Link>
      </article>)}
      {threads.slice(0,3).map(t=><article className="com-card" key={t.id}>
       <span className="com-kicker">FORUM</span><h3>{t.title}</h3>
       <Link href={"/forum/"+t.id}>Άνοιγμα θέματος →</Link>
      </article>)}
     </div>:<p className="com-empty">Δεν υπάρχει ακόμη δραστηριότητα. Κάθε νέα πραγματική καταχώριση, πρόταση και συζήτηση θα εμφανίζεται εδώ.</p>}
   </section>
 </main>;
}

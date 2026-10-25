import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
import {getCommunity} from "../../lib/community";
import "../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Πίνακας ελέγχου μέλους",robots:{index:false,follow:false}};
export default async function Dashboard(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok)return <main id="content" className="com-shell"><h1>Ο προσωπικός χώρος δεν είναι διαθέσιμος.</h1><p>Δεν τροποποιήθηκαν τα στοιχεία σου.</p></main>;
 if(!state.application)redirect("/onboarding");
 const isVerified=state.member?.status==="verified"&&Boolean(state.member.identity_verified_at);
 const community=isVerified?await getCommunity("dashboard"):null;
 const listings=community?.ok?community.listings:[];
 const threads=community?.ok?community.threads:[];
 const ownProposals=state.proposals.filter(p=>p.created_by===user.id);
 const title=state.application.business_name;
 return <main id="content" className="com-shell">
   <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / ΠΡΟΣΩΠΙΚΟ DASHBOARD</span><h1>Καλώς ήρθες,<br/><em>{title}.</em></h1><p>Το επιχειρηματικό σου κέντρο στο ΜΑΖΙ — μόνο πραγματικά στοιχεία του λογαριασμού σου.</p></div><Link className="com-back" href="/members">Στοιχεία συμμετοχής →</Link></div>
   <div className="com-alert">{isVerified?"Η ταυτότητα της επιχείρησής σου έχει ελεγχθεί.":"Η πρόσβασή σου στην κοινότητα ενεργοποιείται μόνο μετά την έγκριση και επαλήθευση ΓΕΜΗ."} Δεν υπάρχουν ενεργές συνδρομές, πιστώσεις ή εκταμιεύσεις.</div>
   <div className="com-stats">
    <div><span>Συμμετοχή</span><strong>{isVerified?"Επαληθευμένη":state.application.status==="pending"?"Υπό έλεγχο":"Σε αναμονή"}</strong><small>{state.member?.admitted_at?"Από "+new Date(state.member.admitted_at).toLocaleDateString("el-GR"):"Έλεγχος επιχείρησης"}</small></div>
    <div><span>Οι προτάσεις μου</span><strong>{ownProposals.length}</strong><small>Υποβολές σε τρέχοντα κύκλο</small></div>
    <div><span>Οι καταχωρίσεις μου</span><strong>{listings.filter(x=>x.status==="active").length}</strong><small>Ανοιχτές στον συνεργατικό χώρο</small></div>
    <div><span>Οι συζητήσεις μου</span><strong>{threads.length}</strong><small>Θέματα στο φόρουμ</small></div>
   </div>
   <div className="com-dashboard-grid">
    <Link href="/members" className="com-nav-card"><span>01 / ΕΠΙΧΕΙΡΗΣΗ</span><h2>Η συμμετοχή μου ↗</h2><p>Αίτηση, επαλήθευση, ερωτήσεις του διαχειριστή και τρέχουσα κατάσταση.</p></Link>
    <Link href={isVerified?"/marketplace":"/members"} className="com-nav-card"><span>02 / ΑΓΟΡΑ</span><h2>Αγορά συνεργασίας ↗</h2><p>Προσφορά προϊόντων, αναζήτηση υπηρεσιών και νέες επαγγελματικές συνέργειες.</p></Link>
    <Link href={isVerified?"/forum":"/members"} className="com-nav-card"><span>03 / ΚΟΙΝΟΤΗΤΑ</span><h2>Φόρουμ μελών ↗</h2><p>Ρώτησε, μοιράσου εμπειρία και ανταποκρίσου στις ανάγκες άλλων επιχειρήσεων.</p></Link>
    <Link href={isVerified?"/livechat":"/members"} className="com-nav-card"><span>04 / ΣΥΝΟΜΙΛΙΑ</span><h2>Livechat ↗</h2><p>Ζωντανή επικοινωνία με την επαληθευμένη κοινότητα.</p></Link>
    <Link href={isVerified?"/inbox":"/members"} className="com-nav-card"><span>05 / ΜΗΝΥΜΑΤΑ</span><h2>Ιδιωτική αλληλογραφία ↗</h2><p>Αιτήματα συνεργασίας και απαντήσεις με άλλες επαληθευμένες επιχειρήσεις.</p></Link>
    <Link href={isVerified?"/proposals":"/members"} className="com-nav-card"><span>06 / ΑΝΑΠΤΥΞΗ</span><h2>Προτάσεις και ψηφοφορίες ↗</h2><p>Παρακολούθηση των πραγματικών προτάσεων και της επιλεξιμότητας συμμετοχής.</p></Link>
    <Link href={isVerified?"/awards":"/members"} className="com-nav-card"><span>07 / ΕΝΙΣΧΥΣΗ</span><h2>Συμφωνίες ενίσχυσης ↗</h2><p>Προβολή τυχόν ατομικών προσφορών, όρων και αποδοχών· χωρίς ενεργή εκταμίευση.</p></Link>
   </div>
   <section className="com-recent"><h2>Η πρόσφατη δραστηριότητά μου</h2>
    {ownProposals.length||listings.length||threads.length?
    <div className="com-list">
     {ownProposals.slice(0,3).map(p=><div className="com-card" key={p.id}><span className="com-kicker">ΠΡΟΤΑΣΗ · {p.status}</span><h3>{p.title}</h3><Link href="/proposals">Δες την πρόταση →</Link></div>)}
     {listings.slice(0,3).map(p=><div className="com-card" key={p.id}><span className="com-kicker">ΑΓΟΡΑ · {p.status}</span><h3>{p.title}</h3><Link href="/marketplace">Οι καταχωρίσεις μου →</Link></div>)}
     {threads.slice(0,3).map(t=><div className="com-card" key={t.id}><span className="com-kicker">ΦΟΡΟΥΜ</span><h3>{t.title}</h3><Link href={"/forum#thread-"+t.id}>Η συζήτηση →</Link></div>)}
    </div>:<p className="com-empty">Δεν υπάρχει ακόμη δραστηριότητα. Οι καταχωρίσεις και οι συζητήσεις θα εμφανίζονται εδώ.</p>}
   </section>
 </main>;
}

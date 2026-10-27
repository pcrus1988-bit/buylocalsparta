import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../../lib/mazi-api";
import "../../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Συλλογική προβολή της επιχείρησής μου",robots:{index:false,follow:false}};
export default async function MemberMarketing(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok)return <main id="content" className="com-shell"><h1>Δεν είναι διαθέσιμα τα δεδομένα συμμετοχής.</h1><p>Δεν εμφανίζουμε εκτιμώμενα αποτελέσματα αντί για πραγματικά στοιχεία.</p><Link href="/dashboard">Επιστροφή στο dashboard</Link></main>;
 if(!state.application)redirect("/onboarding");
 const eligible=state.application.status==="approved"&&state.member?.status==="verified"&&Boolean(state.member.identity_verified_at);
 return <main id="content" className="com-shell"><div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / Η ΠΡΟΒΟΛΗ ΜΟΥ</span><h1>Συλλογική<br/><em>προβολή.</em></h1><p>Η μελλοντική εικόνα καμπανιών της επιχείρησης {state.application.business_name}.</p></div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
 <div className="com-alert"><strong>{eligible?"Η ταυτότητα της επιχείρησης έχει επαληθευθεί.":"Η επιχείρηση βρίσκεται στη διαδικασία ένταξης."}</strong> Το συλλογικό marketing δεν έχει ακόμη ενεργοποιηθεί. Δεν υπάρχουν επαληθευμένα δεδομένα δαπανών ή απόδοσης για παρουσίαση.</div>
 <section className="com-stats" aria-label="Δείκτες μελλοντικού προγράμματος">
 {["Συμμετοχές σε καμπάνιες","Επαληθευμένες προβολές","Επισκέψεις από διαφημίσεις","Δαπάνες κοινών καμπανιών"].map(item=><div key={item}><span>{item}</span><strong>—</strong><small>Μη ενεργό · καμία εικονική μέτρηση</small></div>)}
 </section><div className="com-grid"><div className="com-list"><article className="com-card"><span className="com-kicker">ΚΑΜΠΑΝΙΕΣ</span><h2>Οι καμπάνιες μου</h2><p>Όταν εκκινήσει το πρόγραμμα, εδώ θα εμφανίζονται μόνο πραγματικές εγκεκριμένες συμμετοχές, δημιουργικά, δαπάνες συγκεντρωτικού επιπέδου και διαθέσιμα αποτελέσματα.</p><p className="com-empty">Καμία ενεργή καμπάνια στο πρόγραμμα.</p></article><article className="com-card"><span className="com-kicker">250 TOKENS / ΜΕΛΛΟΝΤΙΚΗ ΕΝΕΡΓΟΠΟΙΗΣΗ</span><h2>Υπηρεσίες κατόπιν αιτήματος</h2><p>Το προτεινόμενο δικαίωμα είναι 250 Tokens ανά εξοφλημένο μηνιαίο κύκλο, χωρίς μεταφορά ή συσσώρευση. Δεν πιστώνονται Tokens όσο δεν λειτουργεί η συνδρομή.</p><Link href="/services">Άνοιξε το πραγματικό υπόλοιπο και τα αιτήματά σου →</Link></article></div><aside className="com-side"><h2>Πριν ενεργοποιηθεί</h2><p>Θα υπάρχει δυνατότητα επιλογής κατάλληλων προϊόντων/προσφορών, έγκρισης δημιουργικών και ελέγχου προτιμήσεων τοπικής προβολής. Δεν αποθηκεύονται ακόμη τέτοιες προτιμήσεις.</p><p>Η προβολή μέσω κοινών καμπανιών δεν εγγυάται πωλήσεις, κλικ ή συγκεκριμένο διαφημιστικό ποσό ανά μέλος.</p><Link href="/marketing" style={{color:"#f6ccb1",fontWeight:800}}>Πώς θα λειτουργεί →</Link></aside></div>
 </main>;
}

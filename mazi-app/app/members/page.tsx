import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {applyForMembership,signOut} from "../actions";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ο χώρος μου",robots:{index:false,follow:false}};
const messages:Record<string,string>={application_received:"Η αίτηση καταχωρίστηκε με επιτυχία και αναμένει πραγματικό έλεγχο.",invalid_application:"Έλεγξε όλα τα πεδία πριν από την υποβολή.",privacy_required:"Για την υποβολή απαιτείται αποδοχή της ενημέρωσης επεξεργασίας δεδομένων.",already_applied:"Έχεις ήδη υποβάλει αίτηση.",application_failed:"Η αίτηση δεν καταχωρίστηκε. Δοκίμασε ξανά αργότερα.",not_verified:"Η επιχείρηση πρέπει πρώτα να επαληθευτεί."};
const statuses:Record<string,string>={pending:"Υπό έλεγχο",approved:"Εγκεκριμένη",rejected:"Δεν εγκρίθηκε"};
export default async function Members({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const snapshot=await maziMemberRequest<MaziState>("state");
 if(!snapshot.ok)return <main id="content"><section className="section shell">
  <h1>Ο χώρος μελών δεν είναι διαθέσιμος αυτή τη στιγμή.</h1>
  <p>Δεν υποβάλαμε καμία αίτηση. Δοκίμασε ξανά αφού ανανεώσεις τη σελίδα.</p>
 </section></main>;
 const {application,member}=snapshot;
 const {notice}=await searchParams;
 return <main id="content"><section className="subhero member-hero"><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΧΩΡΟΣ ΕΠΙΧΕΙΡΗΣΗΣ</span><h1>Ένας χώρος<br/><em>για την επιχείρησή σου.</em></h1><p>Αίτηση, επαλήθευση, συμμετοχή σε πραγματικές διαδικασίες και παρακολούθηση των αιτημάτων σου.</p></div></section>
 <section className="section shell portal-section"><div className="portal-heading"><div><span className="eyebrow">ΠΡΟΣΩΠΙΚΟΣ ΧΩΡΟΣ</span><h2>{application?.business_name||"Η επιχείρησή σου"}</h2><p className="small-muted">Συνδέθηκες ως {user.email}</p></div><form action={signOut}><button className="reset-button" type="submit">Αποσύνδεση ↗</button></form></div>
 {notice&&messages[notice]?<p className="form-message" role="status">{messages[notice]}</p>:null}
 {application?<div className="member-status"><span className="eyebrow">ΚΑΤΑΣΤΑΣΗ ΑΙΤΗΣΗΣ</span><h3>{statuses[application.status]||application.status}</h3><p>Καταχώριση: {new Date(application.created_at).toLocaleDateString("el-GR")}. Η έγκριση δεν σημαίνει αυτόματη οικονομική συμμετοχή ή δικαίωμα λήψης χρηματοδότησης.</p>
 {member?.status==="verified"?<div className="member-actions"><span className="status-chip">Επαληθευμένη επιχείρηση</span>{member.identity_verified_at?<Link href="/proposals" className="button dark">Διαχείριση προτάσεων ↗</Link>:<span className="legal-hint">Εκκρεμεί ο έλεγχος ΓΕΜΗ και η επιβεβαίωση νόμιμης εκπροσώπησης πριν από τις προτάσεις και τις ψηφοφορίες.</span>}</div>:<p className="legal-hint">Η δυνατότητα υποβολής προτάσεων ενεργοποιείται μετά από πραγματικό έλεγχο της αίτησης.</p>}
 {member?.voting_eligible?<p className="small-muted">Τα δικαιώματα συμμετοχής σε ψηφοφορία έχουν ενεργοποιηθεί με έλεγχο επιλεξιμότητας.</p>:null}
 
 </div>:<div className="form-panel application-form"><span className="eyebrow">ΑΙΤΗΣΗ ΕΠΙΧΕΙΡΗΣΗΣ</span><h2>Πες μας ποιοι είστε.</h2><p className="paragraph">Συλλέγουμε τα απαραίτητα στοιχεία για να αξιολογήσουμε μια πραγματική αίτηση ενδιαφέροντος. Δεν υπάρχει σήμερα ενεργή συνδρομή ή δικαίωμα χρηματοδότησης.</p>
 <form action={applyForMembership} className="stack-form">
 <div className="form-grid"><div><label htmlFor="business_name">Επωνυμία επιχείρησης</label><input id="business_name" name="business_name" required minLength={3} maxLength={160}/></div><div><label htmlFor="representative_name">Ονοματεπώνυμο εκπροσώπου</label><input id="representative_name" name="representative_name" required minLength={3} maxLength={120}/></div></div>
 <div className="form-grid"><div><label htmlFor="location">Πόλη / περιοχή</label><input id="location" name="location" required minLength={2} maxLength={120}/></div><div><label htmlFor="sector">Κλάδος δραστηριότητας</label><input id="sector" name="sector" required minLength={2} maxLength={100}/></div></div>
 <label htmlFor="registry_number">Αριθμός ΓΕΜΗ (προαιρετικός)</label><input id="registry_number" name="registry_number" maxLength={12} minLength={12} inputMode="numeric" pattern="[0-9]{12}" placeholder="12 ψηφία"/>
 <label htmlFor="description">Περιγραφή επιχείρησης</label><textarea id="description" name="description" required minLength={20} maxLength={1800} rows={5} placeholder="Τι κάνετε, σε ποια αγορά δραστηριοποιείστε και τι ελπίζετε από το ΜΑΖΙ;"/>
 <label className="checkbox-line"><input type="checkbox" name="accept_privacy" required/> <span>Έχω διαβάσει την ενημέρωση προσωπικών δεδομένων και ζητώ την αξιολόγηση της συμμετοχής μου στο ΜΑΖΙ. Γνωρίζω ότι αυτή δεν είναι συναίνεση για εμπορικά email ούτε δέσμευση πληρωμής.</span></label>
 <button type="submit" className="button dark">Υποβολή αίτησης ενδιαφέροντος ↗</button>
 </form><p className="legal-hint">Για αιτήματα πρόσβασης, διόρθωσης ή διαγραφής προσωπικών δεδομένων επικοινώνησε μέσω της <a href="/privacy">ειδικής ενημέρωσης του ΜΑΖΙ</a>, όπου αναφέρονται ο υπεύθυνος επεξεργασίας και τα δικαιώματά σου.</p></div>}
 </section></main>;
}

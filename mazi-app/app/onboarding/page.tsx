import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
import {acceptMaziInvitation,signOut} from "../actions";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Αποδοχή προσωπικής πρόσκλησης",robots:{index:false,follow:false}};
type ActiveInvite={id:string;terms_version:string;business_name:string;expires_at:string};
export default async function Onboarding({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const existing=await maziMemberRequest<MaziState>("state");
 if(!existing.ok)return <main id="content" className="section shell"><h1>Η υπηρεσία δεν είναι διαθέσιμη.</h1><p>Δεν έγινε αποδοχή ή εγγραφή. Δοκίμασε ξανά αργότερα.</p></main>;
 if(existing.application||existing.member)redirect("/members");
 const response=await maziMemberRequest<{invitation:ActiveInvite|null}>("invitation_state");
 const invitation=response.ok?response.invitation:null;
 const {notice}=await searchParams;
 return <main id="content">
  <section className="subhero"><div className="shell">
   <span className="eyebrow light">ΜΑΖΙ / ΠΡΟΣΩΠΙΚΗ ΠΡΟΣΚΛΗΣΗ</span>
   <h1>Μια επιχείρηση.<br/><em>Μια ξεκάθαρη συμφωνία.</em></h1>
   <p>Ελέγχουμε την προσωπική πρόσκληση πριν ενεργοποιηθεί πρόσβαση στον χώρο επιχειρήσεων.</p>
  </div></section>
  <section className="section shell auth-section"><div className="form-panel">
   {!response.ok?<p role="alert">Η επαλήθευση πρόσκλησης δεν είναι προσωρινά διαθέσιμη. Καμία ενέργεια δεν ολοκληρώθηκε.</p>
   :!invitation?<><span className="eyebrow">ΚΑΜΙΑ ΕΝΕΡΓΗ ΠΡΟΣΚΛΗΣΗ</span>
    <h2>Δεν υπάρχει ενεργή πρόσκληση για αυτό το email.</h2>
    <p>Η σύνδεση λογαριασμού δεν δημιουργεί συμμετοχή. Έλεγξε ότι χρησιμοποίησες το επαληθευμένο email και ότι η προσωπική πρόσκληση δεν έχει λήξει.</p>
    <Link className="button dark" href="/interest">Εκδήλωση ενδιαφέροντος ↗</Link></>
   :<><span className="eyebrow">ΕΠΑΛΗΘΕΥΜΕΝΗ ΠΡΟΣΚΛΗΣΗ</span>
    <h2>{invitation.business_name}</h2>
    <p>Επιβεβαιωμένο email: <strong>{user.email}</strong>. Ισχύει έως {new Date(invitation.expires_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}.</p>
    <div className="record-card"><h3>Αποδοχή συμμετοχής — έκδοση v1</h3>
     <p>Η ένταξη αφορά το μη οικονομικό στάδιο λειτουργίας του ΜΑΖΙ. Δεν υπάρχει συνδρομή, τιμολόγηση, αυτόματη ψήφος ή υποχρέωση πληρωμής.</p>
     <p>Η μελλοντική συνδρομή €250/μήνα, τυχόν υπηρεσίες marketing και οποιαδήποτε αναπτυξιακή ενίσχυση απαιτούν χωριστούς όρους και ανεξάρτητη αποδοχή.</p>
     <p>Το ΜΑΖΙ διατηρεί τον έλεγχο επιλεξιμότητας, σύγκρουσης συμφερόντων και εταιρικής ταυτότητας.</p>
     <p><Link className="text-link" href="/charter" target="_blank">Αρχές διακυβέρνησης ↗</Link> · <Link className="text-link" href="/privacy" target="_blank">Ενημέρωση δεδομένων ↗</Link></p>
    </div>
    {notice==="invitation_not_eligible"?<p role="alert" className="form-message error">Η πρόσκληση δεν είναι πλέον επιλέξιμη ή έχει ήδη καταναλωθεί. Δεν δημιουργήθηκε συμμετοχή.</p>:null}
    <form action={acceptMaziInvitation} className="stack-form">
      <input type="hidden" name="invitation_id" value={invitation.id}/>
      <input type="hidden" name="terms_version" value={invitation.terms_version}/>
      <label className="checkbox-line"><input type="checkbox" name="accept_charter" required/>
       <span>Διάβασα και αποδέχομαι τους όρους της προσωπικής πρόσκλησης και τις αρχές του ΜΑΖΙ. Κατανοώ ότι δεν ενεργοποιείται επί πληρωμή συμμετοχή.</span></label>
      <label className="checkbox-line"><input type="checkbox" name="accept_processing" required/>
       <span>Έλαβα την ενημέρωση επεξεργασίας προσωπικών δεδομένων για την ένταξη και επιβεβαιώνω ότι εκπροσωπώ την επιχείρηση.</span></label>
      <button type="submit" className="button dark">Αποδοχή προσωπικής πρόσκλησης ↗</button>
    </form></>}
    <form action={signOut}><button type="submit" className="reset-button">Αποσύνδεση</button></form>
  </div></section>
 </main>;
}

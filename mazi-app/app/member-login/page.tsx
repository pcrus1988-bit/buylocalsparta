import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {emailSignIn} from "../actions";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Σύνδεση προσκεκλημένου μέλους",robots:{index:false,follow:false}};
const messages:Record<string,string>={
 invalid_email:"Έλεγξε το email.",
 email_unavailable:"Αν έχει δημιουργηθεί προσκεκλημένος λογαριασμός, θα λάβεις σύνδεσμο. Δεν δημιουργήθηκε νέος.",
 expired_link:"Ο σύνδεσμος έληξε. Ζήτησε νέο."
};
export default async function MemberLogin({searchParams}:{searchParams:Promise<{sent?:string;notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(user)redirect("/members");
 const q=await searchParams;
 return <main id="content"><section className="subhero"><div className="shell">
 <span className="eyebrow light">ΜΑΖΙ / ΠΡΟΣΚΕΚΛΗΜΕΝΑ ΜΕΛΗ</span>
 <h1>Η θέση σου.<br/><em>Ο χώρος σου.</em></h1>
 <p>Η σύνδεση είναι διαθέσιμη μόνο για λογαριασμούς που έχουν ήδη δημιουργηθεί μετά από έγκριση και πρόσκληση.</p>
 </div></section>
 <section className="section shell auth-section"><div className="form-panel">
 <span className="eyebrow">ΑΣΦΑΛΗΣ ΣΥΝΔΕΣΗ</span><h2>Σύνδεση με email.</h2>
 {q.sent==="1"?<p role="status" className="form-message">Αν υπάρχει εγκεκριμένος λογαριασμός, στάλθηκε σύνδεσμος σύνδεσης. Έλεγξε και τα ανεπιθύμητα.</p>:null}
 {q.notice&&messages[q.notice]?<p role="alert" className="form-message error">{messages[q.notice]}</p>:null}
 <form className="stack-form" action={emailSignIn}>
  <label htmlFor="member-email">Email προσκεκλημένου μέλους</label>
  <input id="member-email" name="email" type="email" required maxLength={254} autoComplete="email"/>
  <button type="submit" className="button dark">Αίτημα σύνδεσης ↗</button>
 </form>
 <p className="legal-hint">Η αποστολή αιτήματος σύνδεσης δεν δημιουργεί νέο χρήστη ή εγγραφή. Κάθε δικαίωμα μέλους ελέγχεται ανεξάρτητα από τον λογαριασμό.</p>
 <Link href="/join" className="text-link">Δεν έχεις πρόσκληση; Εκδήλωσε ενδιαφέρον με ΑΦΜ →</Link>
 </div></section></main>;
}

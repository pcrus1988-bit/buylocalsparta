import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase/server";
import { emailSignIn } from "../actions";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Σύνδεση υφιστάμενου μέλους",robots:{index:false,follow:false}};
export default async function Join({searchParams}:{searchParams:Promise<{sent?:string;notice?:string}>}){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(user)redirect("/members");
  const params=await searchParams;
  const errors:Record<string,string>={invalid_email:"Συμπλήρωσε έγκυρη διεύθυνση email.",email_unavailable:"Δεν ήταν δυνατό να σταλεί ο σύνδεσμος. Δοκίμασε ξανά αργότερα.",expired_link:"Ο σύνδεσμος δεν είναι πλέον έγκυρος. Ζήτησε καινούργιο."};
  return <main id="content"><section className="subhero"><div className="shell"><span className="eyebrow light">ΜΟΝΟ ΥΦΙΣΤΑΜΕΝΟΙ ΛΟΓΑΡΙΑΣΜΟΙ</span><h1>Έχεις ήδη θέση<br/><em>στο ΜΑΖΙ;</em></h1><p>Η σύνδεση μέσω email είναι διαθέσιμη μόνο για ήδη καταχωρισμένους λογαριασμούς. Νέες επιχειρήσεις ξεκινούν από την αίτηση ΑΦΜ και τον έλεγχο ΓΕΜΗ.</p></div></section>
  <section className="section shell auth-section"><div className="form-panel"><span className="eyebrow">ΣΥΝΔΕΣΗ ΥΦΙΣΤΑΜΕΝΩΝ ΛΟΓΑΡΙΑΣΜΩΝ</span><h2>Πρόσβαση στον λογαριασμό σου.</h2>
  {params.sent==="1"?<p role="status" className="form-message">Αν η διεύθυνση μπορεί να χρησιμοποιηθεί, στάλθηκε σύνδεσμος σύνδεσης. Έλεγξε και τα ανεπιθύμητα.</p>:null}
  {params.notice&&errors[params.notice]?<p role="alert" className="form-message error">{errors[params.notice]}</p>:null}
  <form action={emailSignIn} className="stack-form"><label htmlFor="email">Επαγγελματικό email</label><input id="email" type="email" name="email" required maxLength={254} autoComplete="email" placeholder="name@business.gr"/><button type="submit" className="button dark">Στείλε σύνδεσμο σύνδεσης ↗</button></form>
  <p className="legal-hint">Η σύνδεση δεν δημιουργεί νέο λογαριασμό ούτε επί πληρωμή συμμετοχή. Για νέα αίτηση, ξεκίνησε με τον έλεγχο ΑΦΜ. <a href="/interest" className="text-link">Εκδήλωση ενδιαφέροντος ↗</a></p><Link href="/charter" className="text-link">Διάβασε τις αρχές διακυβέρνησης →</Link></div></section></main>
}

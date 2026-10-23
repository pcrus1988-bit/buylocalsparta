import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
import {acknowledgeGrantOffer} from "../actions";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Όροι αναπτυξιακής ενίσχυσης",robots:{index:false,follow:false}};
const eur=(cents:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(cents/100);
const noticeText:Record<string,string>={
  acknowledged:"Η ξεχωριστή αποδοχή των όρων της προσφοράς καταγράφηκε. Δεν έγινε εκταμίευση ή χρέωση.",
  already_acknowledged:"Η συγκεκριμένη προσφορά έχει ήδη επιβεβαιωθεί και δεν μπορεί να τροποποιηθεί.",
  invalid_acknowledgement:"Επιβεβαίωσε ρητά κάθε όρο της συγκεκριμένης προσφοράς.",
  award_not_eligible:"Η προσφορά έχει λήξει, δεν έχει πλέον εγκριθεί ή δεν αντιστοιχεί στην επιχείρησή σου.",
  acceptance_failed:"Δεν έγινε καταχώριση. Έλεγξε την κατάσταση της προσφοράς."
};
export default async function Awards({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziMemberRequest<MaziState>("state");
 if(!result.ok)return <main id="content"><section className="section shell">
   <h1>Οι ατομικές προσφορές ενίσχυσης δεν είναι διαθέσιμες.</h1>
   <p>Δεν έγινε αποδοχή ή οικονομική ενέργεια.</p></section></main>;
 if(result.member?.status!=="verified"||!result.member.identity_verified_at)
   redirect("/members");
 const offers=result.grant_offers||[];
 const acknowledgements=new Set((result.grant_acknowledgements||[]).map(x=>x.offer_id));
 const params=await searchParams;
 return <main id="content"><section className="subhero member-hero"><div className="shell">
 <span className="eyebrow light">ΜΑΖΙ / ΑΤΟΜΙΚΟΙ ΟΡΟΙ</span>
 <h1>Η απόφαση της κοινότητας.<br/><em>Η δική σου επιλογή.</em></h1>
 <p>Κάθε μελλοντική ενίσχυση απαιτεί ξεχωριστή ρητή αποδοχή συγκεκριμένων όρων από τη δικαιούχο επιχείρηση.</p>
 </div></section>
 <section className="section shell portal-section">
 <div className="portal-heading"><div><span className="eyebrow">ΠΡΟΣΦΟΡΕΣ ΕΝΙΣΧΥΣΗΣ</span>
 <h2>Οι όροι για την επιχείρησή σου</h2></div>
 <Link href="/members" className="text-link">Ο χώρος μου →</Link></div>
 <div className="info-strip"><strong>Το Ταμείο δεν είναι ακόμη ενεργό</strong>
 <p>Το πρόγραμμα λειτουργεί με μηδενικό χρηματοδοτικό προϋπολογισμό. Η επιβεβαίωση όρων δεν ενεργοποιεί χρέωση, ανανέωση συνδρομής, εκταμίευση ή υποχρέωση πριν από ξεχωριστή νόμιμη σύμβαση και τις αναγκαίες εγκρίσεις.</p></div>
 {params.notice&&noticeText[params.notice]?<p className="form-message" role="status">{noticeText[params.notice]}</p>:null}
 {offers.length===0?<div className="empty-state">Δεν υπάρχει προσωπική εγκεκριμένη προσφορά ενίσχυσης προς αποδοχή. Η εμφάνιση εδώ προϋποθέτει πραγματικό χρηματοδοτικό κύκλο και εγκεκριμένη προσφορά.</div>
 :<div style={{display:"grid",gap:24}}>{offers.map(offer=><article className="record-card" key={offer.id}>
 <span className="eyebrow">{acknowledgements.has(offer.id)?"ΕΠΙΒΕΒΑΙΩΘΗΚΕ":"ΑΝΑΜΕΝΕΤΑΙ ΠΡΟΣΩΠΙΚΗ ΕΠΙΒΕΒΑΙΩΣΗ"}</span>
 <h3>Προσφορά μη επιστρεπτέας αναπτυξιακής ενίσχυσης</h3>
 <div className="record-meta">
 <span>Αιτήθηκε: <strong>{eur(offer.requested_amount_cents)}</strong></span>
 <span>Προτάθηκε προς χορήγηση: <strong>{eur(offer.assigned_amount_cents)}</strong></span>
 <span>Πρόσθετοι μήνες συμμετοχής: <strong>{offer.additional_months}</strong></span>
 <span>Νέα αίτηση μετά από: <strong>{offer.reapplication_after_months} μήνες</strong></span>
 </div>
 <p className="legal-hint">Η πρόσθετη διάρκεια υπολογίζεται βάσει του <strong>αιτούμενου</strong>, όχι του τελικά εγκριθέντος ποσού, ακόμη κι αν η κοινότητα εγκρίνει λιγότερα χρήματα. Ενδεικτικό σύνολο μελλοντικών μηνιαίων συνδρομών με αμετάβλητη τιμή: {eur(offer.additional_months*offer.monthly_membership_fee_cents)}. Αυτό δεν αποτελεί άμεση χρέωση.</p>
 <p className="small-muted">ΓΕΜΗ δικαιούχου: {offer.recipient_gemi_number} · Λήξη προσφοράς: {new Date(offer.expires_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</p>
 <section className="legal-document" style={{whiteSpace:"pre-wrap",padding:20,margin:"22px 0"}}>
  <h3>Το πλήρες κείμενο των όρων</h3>
  <p>{offer.agreement_body}</p>
 </section>
 <p className="small-muted">Αμετάβλητο αποτύπωμα κειμένου SHA-256: <code>{offer.agreement_sha256}</code></p>
 {acknowledgements.has(offer.id)?<p className="form-message">Η αποδοχή αυτής της ακριβούς έκδοσης καταγράφηκε. Δεν απαιτείται νέα ενέργεια.</p>:
 <form action={acknowledgeGrantOffer} className="stack-form">
  <input type="hidden" name="offer_id" value={offer.id}/>
  <input type="hidden" name="policy_version" value={offer.policy_version}/>
  <input type="hidden" name="agreement_sha256" value={offer.agreement_sha256}/>
  <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
   <input type="checkbox" name="understand_requested_amount_basis" required style={{width:20,minWidth:20,height:20,marginTop:3}}/>
   <span>Κατανοώ ότι οι πρόσθετοι μήνες βασίζονται στο αρχικά αιτούμενο ποσό και όχι στο τελικά προτεινόμενο προς χορήγηση.</span>
  </label>
  <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
   <input type="checkbox" name="understand_separate_disbursement" required style={{width:20,minWidth:20,height:20,marginTop:3}}/>
   <span>Κατανοώ ότι η επιβεβαίωση δεν καταβάλλει χρήματα και ότι απαιτούνται περαιτέρω νόμιμη σύμβαση, διαδικασίες και τελικές εγκρίσεις.</span>
  </label>
  <label style={{display:"flex",gap:12,alignItems:"flex-start"}}>
   <input type="checkbox" name="affirmatively_accepted" required style={{width:20,minWidth:20,height:20,marginTop:3}}/>
   <span>Διάβασα το πλήρες κείμενο και αποδέχομαι ρητά τους ατομικούς όρους της συγκεκριμένης προσφοράς για περαιτέρω εξέταση.</span>
  </label>
  <button type="submit" className="button dark">Καταχώριση προσωπικής αποδοχής ↗</button>
 </form>}
 </article>)}</div>}
 </section></main>;
}

import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../../lib/mazi-api";
import {saveMarketingPreferences,deleteMarketingPreferences,respondCreativeInvitation} from "./actions";
import "../../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Συλλογική προβολή της επιχείρησής μου",robots:{index:false,follow:false}};
const channels=[
 ["social","Social media"],["search","Αναζήτηση"],["marketplace","KONTA ΜΟΥ"],
 ["local_media","Τοπικά μέσα"],["print","Έντυπα"],["event","Εκδηλώσεις"]
] as const;
type Preference={wants_collective_campaigns:boolean;channels:string[];region:string;member_note:string;updated_at:string};
type Invite={id:string;campaign_title:string;channel:string;creative_text:string;asset_description:string;destination_url:string;status:string;created_at:string;expires_at:string;responded_at:string|null};
const inviteState:Record<string,string>={issued:"Πρόταση υποβλήθηκε για έλεγχο",pending:"Αναμένει απόφαση",approved:"Εγκρίθηκε ως προεπισκόπηση",declined:"Δεν εγκρίθηκε",withdrawn:"Ανακλήθηκε από το μέλος",revoked:"Ανακλήθηκε από τον διαχειριστή"};
export default async function MemberMarketing({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok)return <main id="content" className="com-shell"><h1>Δεν είναι διαθέσιμα τα δεδομένα συμμετοχής.</h1><p>Δεν εμφανίζουμε εκτιμώμενα αποτελέσματα αντί για πραγματικά στοιχεία.</p><Link href="/dashboard">Επιστροφή στο dashboard</Link></main>;
 if(!state.application)redirect("/onboarding");
 const eligible=state.application.status==="approved"&&state.member?.status==="verified"&&Boolean(state.member.identity_verified_at);
 const {data:preference,error}=await db.from("mazi_marketing_preferences")
 .select("wants_collective_campaigns,channels,region,member_note,updated_at")
 .eq("member_user_id",user.id).maybeSingle();
 const saved=preference as Preference|null;
 const {data:invitations,error:invitationError}=await db.from("mazi_marketing_creative_invitations")
  .select("id,campaign_title,channel,creative_text,asset_description,destination_url,status,created_at,expires_at,responded_at")
  .eq("member_user_id",user.id).order("created_at",{ascending:false}).limit(50);
 const invites=(invitations||[]) as Invite[];
 const {data:decisionHistory,error:historyError}=await db.from("mazi_marketing_creative_events")
  .select("invitation_id,event_kind,event_at").order("event_at",{ascending:false}).limit(300);
 const history=(decisionHistory||[]) as {invitation_id:string;event_kind:string;event_at:string}[];
 const params=await searchParams;
 return <main id="content" className="com-shell">
 <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / Η ΠΡΟΒΟΛΗ ΜΟΥ</span><h1>Συλλογική<br/><em>προβολή.</em></h1>
 <p>Η θέση της επιχείρησής σου στον μελλοντικό σχεδιασμό κοινής προβολής: {state.application.business_name}.</p></div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
 <div className="com-alert"><strong>{eligible?"Η επιχείρησή σου είναι επαληθευμένη.":"Αναμένεται έλεγχος της συμμετοχής σου."}</strong> Δεν έχουν ενεργοποιηθεί συνδρομές, πληρωμένες καμπάνιες ή διαφημιστική προβολή. Η δήλωση ενδιαφέροντος δεν εξουσιοδοτεί διαφήμιση ή χρήση λογότυπου/υλικού.</div>
 {params.notice==="deleted"?<p className="com-feedback" role="status">Οι αποθηκευμένες προτιμήσεις αφαιρέθηκαν από τον λογαριασμό σου.</p>:null}
 {params.notice==="creative_saved"?<p className="com-feedback" role="status">Η απόφαση για το συγκεκριμένο δημιουργικό καταγράφηκε. Δεν ενεργοποιεί διαφήμιση.</p>:null}
 {params.notice==="creative_failed"||params.notice==="creative_invalid"?<p className="com-feedback" role="alert">Δεν αποθηκεύτηκε η απόφαση. Η πρόταση ίσως έχει λήξει ή αλλάξει κατάσταση.</p>:null}
 {params.notice==="saved"?<p className="com-feedback" role="status">Οι προτιμήσεις σου αποθηκεύτηκαν. Μπορείς να τις αλλάξεις οποτεδήποτε.</p>:null}
 {params.notice==="unavailable"?<p className="com-feedback" role="alert">Η αποθήκευση απέτυχε. Δεν αλλάξαμε τις προτιμήσεις σου.</p>:null}
 {params.notice==="invalid"||params.notice==="not_verified"?<p className="com-feedback" role="alert">Δεν έγινε αποθήκευση. Έλεγξε την κατάσταση συμμετοχής και τα στοιχεία.</p>:null}
 <section className="com-stats" aria-label="Ατομική ενημέρωση" style={{gridTemplateColumns:"repeat(auto-fit,minmax(205px,1fr))"}}>
 <div><span>Η δήλωσή μου</span><strong>{saved?(saved.wants_collective_campaigns?"Ενδιαφέρομαι":"Όχι τώρα"):"—"}</strong><small>{saved?"Εθελοντική προτίμηση":"Δεν έχει αποθηκευτεί επιλογή"}</small></div>
 <div><span>Πραγματικές καμπάνιες</span><strong>—</strong><small>Δεν υπάρχει ενεργό πρόγραμμα</small></div>
 <div><span>Μέτρηση προβολών</span><strong>—</strong><small>Δεν υπάρχουν επαληθευμένα στοιχεία</small></div>
 <div><span>Media spend μέλους</span><strong>—</strong><small>Δεν αποτελεί ατομικό διαφημιστικό πορτοφόλι</small></div>
 </section>
 <div className="com-grid"><div className="com-list">
 <article className="com-card"><span className="com-kicker">01 / ΠΡΟΤΙΜΗΣΕΙΣ</span><h2>Πού θα ήθελες να εμφανίζεται η επιχείρησή σου;</h2>
 <p>Η επιλογή είναι εθελοντική, μόνο για τον εσωτερικό σχεδιασμό του ΜΑΖΙ. Δεν επιτρέπει αποστολή διαφημιστικών email, χρήση δημιουργικού ή αγορά προβολής. Μπορείς να δηλώσεις ότι δεν ενδιαφέρεσαι.</p>
 {!eligible?<p className="com-empty">Η επεξεργασία προτιμήσεων είναι διαθέσιμη μετά από επαλήθευση της επιχείρησης και έγκριση της συμμετοχής.</p>:
 error?<p className="com-empty" role="alert">Η υπηρεσία προτιμήσεων δεν είναι διαθέσιμη. Δεν αποθηκεύουμε δεδομένα όσο δεν λειτουργεί.</p>:
 <form action={saveMarketingPreferences} className="com-form">
 <label style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" name="wants_collective_campaigns" value="yes" defaultChecked={saved?.wants_collective_campaigns??false}/> Με ενδιαφέρει να εξεταστεί η επιχείρησή μου για μελλοντικές κοινές ενέργειες</label>
 <fieldset style={{border:"1px solid #d5dfd3",padding:18}}><legend style={{fontWeight:800,fontSize:13}}>Κανάλια προτίμησης</legend>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>{channels.map(([value,label])=><label key={value} style={{display:"flex",gap:8,alignItems:"center",fontWeight:500}}>
 <input type="checkbox" name="channels" value={value} defaultChecked={saved?.channels.includes(value)||false}/>{label}</label>)}</div></fieldset>
 <label>Περιοχή / κοινό
 <input name="region" maxLength={120} defaultValue={saved?.region||""} placeholder="Π.χ. Λακωνία, Πελοπόννησος"/></label>
 <label>Σημείωση στον σχεδιασμό (έως 1.000 χαρακτήρες)
 <textarea name="member_note" rows={4} maxLength={1000} defaultValue={saved?.member_note||""} placeholder="Τι θα ήθελες να προωθήσεις ή ποιο κοινό αναζητάς;"/></label>
 <p className="legal-hint">Η δήλωση καταγράφεται στον λογαριασμό σου για εσωτερικό σχεδιασμό. Δεν αποτελεί συμφωνία υπηρεσιών, άδεια επεξεργασίας για emails ή δημοσίευση προϊόντων. <Link href="/privacy" style={{textDecoration:"underline"}}>Προστασία δεδομένων</Link>.</p>
 <button className="com-button" type="submit">Αποθήκευση / ενημέρωση προτιμήσεων</button>
 {saved?<span className="com-kicker">Τελευταία ενημέρωση: {new Date(saved.updated_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>:null}
 </form>}
 </article>
 {saved?<article className="com-card"><span className="com-kicker">ΑΝΑΚΛΗΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</span><h2>Διαγραφή προτιμήσεων</h2><p>Μπορείς να αφαιρέσεις τη δήλωσή σου, την περιοχή, τα κανάλια και τη σημείωση από τον λογαριασμό. Η διαγραφή δεν επηρεάζει την εγγραφή μέλους.</p><form action={deleteMarketingPreferences}><button type="submit" className="com-minor">Διαγραφή των αποθηκευμένων προτιμήσεων</button></form></article>:null}
 <article className="com-card"><span className="com-kicker">02 / ΕΓΚΡΙΣΗ ΔΗΜΙΟΥΡΓΙΚΩΝ</span><h2>Προτάσεις που απαιτούν τη δική σου απόφαση</h2>
 <p>Εδώ εμφανίζεται το ακριβές κείμενο, η περιγραφή υλικού και η σελίδα KONTA ΜΟΥ. Αποδοχή σημαίνει συναίνεση στην καταγραφή της συγκεκριμένης προεπισκόπησης, όχι αυτόματη δημοσίευση ή αγορά διαφημιστικού χώρου.</p>
 {invitationError?<p className="com-empty" role="alert">Οι πραγματικές προτάσεις δεν είναι διαθέσιμες. Δεν εμφανίζουμε δοκιμαστικές εγκρίσεις.</p>:
 invites.length===0?<p className="com-empty">Δεν υπάρχει ακόμη πρόταση δημιουργικού για την επιχείρησή σου.</p>:
 <div style={{display:"grid",gap:16}}>{invites.map(inv=><section key={inv.id} style={{border:"1px solid #ced8cc",padding:20}}>
  <span className="com-kicker">{inviteState[inv.status]||inv.status} · {inv.channel}</span><h3>{inv.campaign_title}</h3>
  <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{inv.creative_text}</p>
  {inv.asset_description?<p><strong>Υλικό:</strong> {inv.asset_description}</p>:null}
  <p><strong>Προορισμός:</strong> <a href={inv.destination_url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>{inv.destination_url}</a></p>
  <p className="com-meta">Πρόταση έως {new Date(inv.expires_at).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})} · Έκδοση creative-preview-v1</p>
  {!historyError?<details style={{margin:"15px 0"}}><summary style={{cursor:"pointer",fontWeight:700}}>Ιστορικό προεπισκόπησης</summary>
   <ol style={{paddingLeft:20}}>{history.filter(ev=>ev.invitation_id===inv.id).map(ev=><li key={ev.event_at+ev.event_kind} style={{marginTop:8,fontSize:12}}>{inviteState[ev.event_kind]||ev.event_kind} · {new Date(ev.event_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</li>)}</ol>
  </details>:<p className="com-meta">Το ιστορικό ελέγχου δεν είναι προσωρινά διαθέσιμο.</p>}
  {inv.status==="pending"&&Date.parse(inv.expires_at)>Date.now()?
   <form action={respondCreativeInvitation} style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <input type="hidden" name="invitation_id" value={inv.id}/>
    <button className="com-button" type="submit" name="status" value="approved">Εγκρίνω την προεπισκόπηση</button>
    <button className="com-minor" type="submit" name="status" value="declined">Δεν εγκρίνω</button>
   </form>:inv.status==="approved"?<form action={respondCreativeInvitation}><input type="hidden" name="invitation_id" value={inv.id}/><button className="com-minor" type="submit" name="status" value="withdrawn">Ανάκληση έγκρισης</button></form>:null}
 </section>)}</div>}
 </article>
 <article className="com-card"><span className="com-kicker">02 / ΚΑΜΠΑΝΙΕΣ</span><h2>Οι καμπάνιες μου</h2><p>Η συμμετοχή σε συγκεκριμένη καμπάνια θα χρειάζεται χωριστή, σαφή διαδικασία έγκρισης δημιουργικού και διαθεσιμότητας. Δεν υπάρχει ενεργή καμπάνια ή μετρημένο media spend.</p><div className="com-empty">Καμία ενεργή καμπάνια στο πρόγραμμα.</div></article>
 <article className="com-card"><span className="com-kicker">03 / 250 TOKENS</span><h2>Οι υπηρεσίες μου</h2><p>Το προσωπικό υπόλοιπο Tokens και οι πραγματικές αιτήσεις υπηρεσιών εμφανίζονται στον χωριστό μηχανισμό, μόνο με εγκεκριμένο πληρωμένο κύκλο. Δεν πιστώνονται Tokens όσο δεν λειτουργεί η συνδρομή.</p><Link href="/services">Άνοιξε υπηρεσίες και Tokens →</Link></article>
 </div><aside className="com-side"><h2>Δίκαιη προβολή</h2><p>Η επιλογή καμπανιών θα βασίζεται σε γεωγραφική και κλαδική συνάφεια, πραγματικές προσφορές, επιλεξιμότητα και προηγούμενη έκθεση, χωρίς εγγυημένο αριθμό εμφανίσεων ή πωλήσεων.</p><p>Η αποθήκευση προτιμήσεων δεν δημιουργεί χρέωση, οικονομική δέσμευση ή άδεια χρήσης φωτογραφιών και λογοτύπου.</p><Link href="/marketing" style={{color:"#f6ccb1",fontWeight:800}}>Ο κανονισμός συλλογικής προβολής →</Link></aside></div>
 </main>;
}

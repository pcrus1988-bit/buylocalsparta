import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {replyInquiry} from "../community-actions";
import "../community.css";
type Inquiry={id:string;listing_id:string;sender_user_id:string;recipient_user_id:string;status:string;created_at:string};
type InquiryMessage={id:string;inquiry_id:string;member_user_id:string;body:string;created_at:string};
type Inbox={inquiries:Inquiry[];inquiry_messages:InquiryMessage[];listing_labels:Record<string,string>;businesses:Record<string,string>};
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Μηνύματα συνεργασίας",robots:{index:false,follow:false}};
export default async function InboxPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const result=await maziMemberRequest<Inbox>("community_inbox");
 if(!result.ok)return <main id="content" className="com-shell"><h1>Η αλληλογραφία δεν είναι διαθέσιμη.</h1><p>Απαιτείται επαληθευμένη ενεργή συμμετοχή.</p><Link href="/dashboard">Ο χώρος μου</Link></main>;
 const {notice}=await searchParams;
 return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / ΙΔΙΩΤΙΚΗ ΕΠΙΚΟΙΝΩΝΙΑ</span><h1>Οι συνεργασίες <em>ξεκινούν εδώ.</em></h1><p>Συζητήσεις για πραγματικές καταχωρίσεις — ορατές μόνο στις δύο επιχειρήσεις.</p></div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
  <div className="com-alert">Τα μηνύματα αποθηκεύονται στο ΜΑΖΙ και είναι προσβάσιμα από τα εμπλεκόμενα μέλη και τον εξουσιοδοτημένο διαχειριστή για λόγους ασφάλειας. Η συζήτηση δεν αποτελεί παραγγελία ή πληρωμή.</div>
  {notice?<p className="com-feedback" role="status">{notice==="saved"?"Το μήνυμα αποθηκεύτηκε.":notice==="rate_limited"?"Προσπάθησε ξανά σε λίγο.":"Δεν πραγματοποιήθηκε η ενέργεια."}</p>:null}
  <section className="com-list">{result.inquiries.length?result.inquiries.map(thread=>{
   const name=result.businesses[thread.sender_user_id===user.id?thread.recipient_user_id:thread.sender_user_id]||"Επαληθευμένο μέλος";
   const messages=result.inquiry_messages.filter(m=>m.inquiry_id===thread.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
   return <article className="com-card" key={thread.id}>
    <div className="com-meta"><span className="com-tag">{thread.sender_user_id===user.id?"ΕΣΥ ΕΚΔΗΛΩΣΕΣ ΕΝΔΙΑΦΕΡΟΝ":"ΕΧΕΙΣ ΝΕΟ ΕΝΔΙΑΦΕΡΟΝ"}</span><span>{new Date(thread.created_at).toLocaleDateString("el-GR")}</span></div>
    <h2>{result.listing_labels[thread.listing_id]||"Καταχώριση μελών"}</h2><p className="com-by">Συνομιλία με: {name}</p>
    <div className="com-replies">{messages.map(m=><div key={m.id} className="com-reply"><div className="com-meta"><strong>{m.member_user_id===user.id?"Εσύ":name}</strong><span>{new Date(m.created_at).toLocaleString("el-GR")}</span></div><p>{m.body}</p></div>)}</div>
    {thread.status==="open"?<form action={replyInquiry} className="com-form"><input type="hidden" name="inquiry_id" value={thread.id}/><label>Γράψε απάντηση<textarea name="body" required minLength={2} maxLength={1500} rows={3}/></label><button className="com-button">Απάντηση ↗</button></form>:<p>Η συνομιλία έχει κλείσει.</p>}
   </article>;
  }):<p className="com-empty">Δεν υπάρχουν ακόμη συνομιλίες. Επίλεξε μια προσφορά ή αναζήτηση για να ξεκινήσεις.</p>}</section>
  <p style={{marginTop:24}}><Link className="com-back" href="/marketplace">Πίσω στην αγορά μελών ↗</Link></p>
 </main>;
}

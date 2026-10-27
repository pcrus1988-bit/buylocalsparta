import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {isInquiryUnread,type CommunityInbox} from "../../lib/community";
import {replyInquiry,reportInquiryMessage,updateInquiryState} from "../community-actions";
import "../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Μηνύματα συνεργασίας",robots:{index:false,follow:false}};
const notices:Record<string,string>={
 saved:"Το μήνυμα αποθηκεύτηκε.",
 read:"Η συνομιλία σημειώθηκε ως διαβασμένη.",
 closed:"Η συνομιλία έκλεισε. Το προηγούμενο ιστορικό παραμένει διαθέσιμο.",
 reported:"Η αναφορά παραδόθηκε για χειροκίνητη εξέταση.",
 not_saved:"Η ενέργεια δεν ολοκληρώθηκε."
};
export default async function InboxPage({searchParams}:{searchParams:Promise<{notice?:string;view?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziMemberRequest<CommunityInbox>("community_inbox");
 if(!result.ok)return <main id="content" className="com-shell">
   <h1>Η αλληλογραφία δεν είναι διαθέσιμη.</h1>
   <p>Η ιδιωτική επικοινωνία απαιτεί επαληθευμένη ενεργή συμμετοχή.</p>
   <Link href="/dashboard">Ο χώρος μου</Link>
 </main>;
 const {notice,view}=await searchParams;
 const filter=view==="unread"||view==="active"?view:"all";
 const records=[...result.inquiries].sort((a,b)=>
  Date.parse(b.last_message_at||b.created_at)-Date.parse(a.last_message_at||a.created_at));
 const unread=records.filter(x=>isInquiryUnread(x,user.id));
 const active=records.filter(x=>x.status==="open");
 const filtered=filter==="unread"?unread:filter==="active"?active:records;
 return <main id="content" className="com-shell">
  <div className="com-top"><div>
   <span className="com-kicker">ΜΑΖΙ / ΙΔΙΩΤΙΚΗ ΕΠΙΚΟΙΝΩΝΙΑ</span>
   <h1>Οι συνεργασίες <em>ξεκινούν εδώ.</em></h1>
   <p>Προσωπικές επαγγελματικές συνομιλίες ανάμεσα σε δύο επαληθευμένες επιχειρήσεις.</p>
  </div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
  <div className="com-alert">
   Τα μηνύματα αποθηκεύονται στο ΜΑΖΙ και είναι διαθέσιμα μόνο στα δύο μέλη της συνομιλίας και σε εξουσιοδοτημένο διαχειριστή για λόγους ασφάλειας ή αναφορών.
   Η συζήτηση δεν αποτελεί παραγγελία ή πληρωμή.
  </div>
  {notice?<p className="com-feedback" role="status">{notices[notice]||"Η ενέργεια δεν ολοκληρώθηκε."}</p>:null}
  <section className="com-inbox-overview" aria-label="Κατάσταση εισερχομένων">
   <div><strong>{records.length}</strong><span>Συνομιλίες</span></div>
   <div><strong>{active.length}</strong><span>Ενεργές</span></div>
   <div><strong>{unread.length}</strong><span>Αδιάβαστες</span></div>
  </section>
  <nav className="com-tabs" aria-label="Φίλτρα μηνυμάτων">
   <Link aria-current={filter==="all"?"page":undefined} href="/inbox">Όλα ({records.length})</Link>
   <Link aria-current={filter==="unread"?"page":undefined} href="/inbox?view=unread">Αδιάβαστα ({unread.length})</Link>
   <Link aria-current={filter==="active"?"page":undefined} href="/inbox?view=active">Ενεργά ({active.length})</Link>
  </nav>
  <section className="com-list" aria-label="Οι ιδιωτικές συνομιλίες">
   {filtered.length?filtered.map(thread=>{
    const otherId=thread.sender_user_id===user.id?thread.recipient_user_id:thread.sender_user_id;
    const name=result.businesses[otherId]||"Επαληθευμένη επιχείρηση";
    const messages=result.inquiry_messages.filter(m=>m.inquiry_id===thread.id)
      .sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const isUnread=isInquiryUnread(thread,user.id);
    return <article className={"com-card com-inquiry"+(isUnread?" com-inquiry-unread":"")}
      id={"inquiry-"+thread.id} key={thread.id}>
     <div className="com-meta">
      <span className="com-tag">{thread.sender_user_id===user.id?"ΕΣΥ ΕΚΔΗΛΩΣΕΣ ΕΝΔΙΑΦΕΡΟΝ":"ΕΙΣΕΡΧΟΜΕΝΟ ΕΝΔΙΑΦΕΡΟΝ"}</span>
      <span>{thread.last_message_at
        ?new Date(thread.last_message_at).toLocaleString("el-GR")
        :new Date(thread.created_at).toLocaleDateString("el-GR")}</span>
     </div>
     <div className="com-inquiry-heading">
      <div><h2>{result.listing_labels[thread.listing_id]||"Καταχώριση μελών"}</h2>
       <p className="com-by">Συνομιλία με: {name}</p>
      </div>
      <div className="com-inquiry-labels">
       {isUnread?<span className="com-tag com-tag-unread">ΑΔΙΑΒΑΣΤΟ</span>:null}
       {thread.status==="closed"?<span className="com-tag">ΚΛΕΙΣΤΗ</span>:null}
      </div>
     </div>
     <div className="com-replies">
      {messages.slice(-3).map(m=><div key={m.id} className="com-reply">
       <div className="com-meta"><strong>{m.member_user_id===user.id?"Εσύ":name}</strong>
        <span>{new Date(m.created_at).toLocaleString("el-GR")}</span></div>
       <p>{m.body}</p>
       {m.member_user_id!==user.id?<details className="com-report">
        <summary>Αναφορά ιδιωτικού μηνύματος</summary>
        <form action={reportInquiryMessage}>
         <input type="hidden" name="resource_id" value={m.id}/>
         <label>Λόγος αναφοράς<textarea name="reason" minLength={20} maxLength={500} required rows={3}
          placeholder="Εξήγησε το πρόβλημα στον διαχειριστή."/></label>
         <button className="com-minor" type="submit">Αποστολή αναφοράς</button>
        </form></details>:null}
      </div>)}
      {!messages.length?<p>Δεν υπάρχουν πρόσφατα ορατά μηνύματα σε αυτήν τη συνομιλία.</p>:null}
     </div>
     <p className="com-by">Προεπισκόπηση τελευταίων μηνυμάτων · <Link href={"/inbox/"+thread.id}>Πλήρες ιστορικό και απάντηση ↗</Link></p>
     <div className="com-inquiry-actions">
      {isUnread?<form action={updateInquiryState}>
       <input type="hidden" name="inquiry_id" value={thread.id}/>
       <button className="com-minor" name="action" value="read">Σήμανση ως διαβασμένο</button>
      </form>:null}
      {thread.status==="open"?<form action={updateInquiryState}>
       <input type="hidden" name="inquiry_id" value={thread.id}/>
       <button className="com-minor" name="action" value="close">Κλείσιμο συνομιλίας</button>
      </form>:null}
     </div>
     {thread.status==="open"?<form action={replyInquiry} className="com-form">
      <input type="hidden" name="inquiry_id" value={thread.id}/>
      <label>Γράψε απάντηση<textarea name="body" required minLength={2} maxLength={1500} rows={3}/></label>
      <button className="com-button">Απάντηση ↗</button>
     </form>:<p className="com-by">Η συνομιλία έχει κλείσει. Το ιστορικό παραμένει προσβάσιμο.</p>}
    </article>;
   }):<p className="com-empty">Δεν υπάρχουν {filter==="unread"?"αδιάβαστες":filter==="active"?"ενεργές":""} συνομιλίες με αυτά τα κριτήρια.</p>}
  </section>
  <p style={{marginTop:24}}><Link className="com-back" href="/marketplace">Πίσω στην αγορά μελών ↗</Link></p>
 </main>;
}

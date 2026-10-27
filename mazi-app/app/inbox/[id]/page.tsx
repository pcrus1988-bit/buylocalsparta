import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest} from "../../../lib/mazi-api";
import {isInquiryUnread,type CommunityInquiryThread} from "../../../lib/community";
import {replyInquiry,reportInquiryMessage,updateInquiryState} from "../../community-actions";
import "../../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ιδιωτική συζήτηση συνεργασίας",robots:{index:false,follow:false}};
const validUuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const statusText:Record<string,string>={
 saved:"Το μήνυμα καταχωρίστηκε.",
 read:"Η συνομιλία σημειώθηκε ως διαβασμένη.",
 closed:"Η συνομιλία έκλεισε. Διατηρείται το ιστορικό της.",
 reported:"Η αναφορά καταχωρίστηκε για χειροκίνητη αξιολόγηση.",
 not_saved:"Δεν ολοκληρώθηκε η ενέργεια. Έλεγξε τα όρια και τα στοιχεία."
};

export default async function PrivateConversation({params,searchParams}:{
 params:Promise<{id:string}>;
 searchParams:Promise<{page?:string;notice?:string}>;
}){
 const {id}=await params;
 if(!validUuid(id))notFound();
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const query=await searchParams;
 const pageValue=query.page??"0";
 if(!/^(0|[1-9]\d{0,1})$/.test(pageValue))notFound();
 const page=Number(pageValue);
 const result=await maziMemberRequest<CommunityInquiryThread>(
  "community_inquiry_thread",{inquiry_id:id,page}
 );
 // The gateway never reveals even the existence of other members' threads.
 if(!result.ok)notFound();
 const thread=result.thread;
 const unread=isInquiryUnread(thread,user.id);
 const base="/inbox/"+id;
 return <main id="content" className="com-shell com-conversation">
  <nav aria-label="Επιστροφή">
   <Link href="/inbox" className="com-back">← Όλες οι συνομιλίες</Link>
  </nav>
  <div className="com-top" style={{marginTop:35}}>
   <div>
    <span className="com-kicker">ΜΑΖΙ / ΙΔΙΩΤΙΚΗ ΣΥΝΕΡΓΑΣΙΑ</span>
    <h1>{result.listing_title}</h1>
    <p>Συνομιλία με <strong>{result.other_business_name}</strong></p>
    <div className="com-inquiry-labels">
     <span className="com-tag">{thread.status==="open"?"ΕΝΕΡΓΗ ΣΥΝΟΜΙΛΙΑ":"ΚΛΕΙΣΤΗ ΣΥΝΟΜΙΛΙΑ"}</span>
     {unread?<span className="com-tag com-tag-unread">ΑΔΙΑΒΑΣΤΑ ΜΗΝΥΜΑΤΑ</span>:null}
    </div>
   </div>
  </div>
  <div className="com-alert">
   Η επικοινωνία αφορά μόνο τις δύο επιχειρήσεις και δεν αποτελεί παραγγελία ή πληρωμή.
   Μην καταχωρίζεις προσωπικά δεδομένα τρίτων ή εμπιστευτικά στοιχεία που δεν χρειάζονται.
  </div>
  {query.notice?<p className="com-feedback" role="status">{statusText[query.notice]||statusText.not_saved}</p>:null}
  <div className="com-inquiry-actions" aria-label="Ενέργειες συνομιλίας">
   {unread?<form action={updateInquiryState}>
    <input type="hidden" name="inquiry_id" value={id}/>
    <button className="com-minor" type="submit" name="action" value="read">Σήμανση ως διαβασμένο</button>
   </form>:null}
   {thread.status==="open"?<form action={updateInquiryState}>
    <input type="hidden" name="inquiry_id" value={id}/>
    <button className="com-minor" type="submit" name="action" value="close">Κλείσιμο συνομιλίας</button>
   </form>:null}
  </div>
  <section className="com-card" aria-label="Ιστορικό συνομιλίας">
   <div className="com-meta">
    <strong>{page===0?"Τα πιο πρόσφατα μηνύματα":"Προηγούμενα μηνύματα"}</strong>
    <span>Σελίδα {page+1} · έως 40 μηνύματα ανά σελίδα</span>
   </div>
   <div className="com-conversation-feed" role="log" aria-label="Μηνύματα συνεργασίας">
    {result.messages.length?result.messages.map(message=>{
     const own=message.member_user_id===user.id;
     return <article key={message.id} className={"com-chat-line"+(own?" mine":"")}>
      <div className="com-meta">
       <strong>{own?"Εσύ":result.other_business_name}</strong>
       <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("el-GR")}</time>
      </div>
      <p>{message.body}</p>
      {!own?<details className="com-report">
       <summary>Αναφορά μηνύματος</summary>
       <form action={reportInquiryMessage}>
        <input type="hidden" name="resource_id" value={message.id}/>
        <input type="hidden" name="inquiry_id" value={id}/>
        <label>Αιτιολογία<textarea name="reason" required minLength={20} maxLength={500} rows={3}/></label>
        <button type="submit" className="com-minor">Αποστολή αναφοράς</button>
       </form>
      </details>:null}
     </article>;
    }):<p className="com-empty">Δεν υπάρχουν ορατά μηνύματα σε αυτήν τη σελίδα.</p>}
   </div>
   <nav className="com-conversation-pagination" aria-label="Σελίδες ιστορικού">
    {result.has_older?<Link className="com-back" href={base+"?page="+(page+1)}>← Παλαιότερα μηνύματα</Link>:<span/>}
    {page>0?<Link className="com-back" href={page===1?base:base+"?page="+(page-1)}>Νεότερα μηνύματα →</Link>:null}
   </nav>
   {page===0&&thread.status==="open"?<form action={replyInquiry} className="com-form">
    <input type="hidden" name="inquiry_id" value={id}/>
    <label>Απάντηση στην επιχείρηση
     <textarea name="body" rows={4} required minLength={2} maxLength={1500}
      placeholder="Γράψε ένα επαγγελματικό μήνυμα…"/>
    </label>
    <button className="com-button" type="submit">Αποστολή μηνύματος ↗</button>
   </form>:null}
   {thread.status==="closed"?<p className="com-by">Αυτή η συνομιλία έχει κλείσει. Τα ορατά μηνύματα παραμένουν στο ιστορικό.</p>:null}
  </section>
 </main>;
}

import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {getCommunity,businessName,dateGR} from "../../lib/community";
import {createThread,replyThread,reportContent} from "../community-actions";
import "../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Φόρουμ μελών",robots:{index:false,follow:false}};
export default async function Forum({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const data=await getCommunity("forum");if(!data.ok)return <main id="content" className="com-shell"><h1>Το φόρουμ δεν είναι διαθέσιμο.</h1><Link href="/dashboard">Ο χώρος μου</Link></main>;
 const {notice}=await searchParams;return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / ΚΟΙΝΟΤΗΤΑ</span><h1>Η γνώση <em>μοιράζεται.</em></h1><p>Ερωτήσεις, πρακτικές λύσεις και συζητήσεις των μελών.</p></div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
  {notice?<p role="status" className="com-feedback">{notice==="saved"?"Η ενέργεια καταχωρίστηκε.":notice==="rate_limited"?"Προσπάθησε ξανά σε λίγο.":"Η ενέργεια δεν ολοκληρώθηκε."}</p>:null}
  <div className="com-grid"><section className="com-list">{data.threads.length?data.threads.map(thread=><article key={thread.id} className="com-card" id={"thread-"+thread.id}>
    <div className="com-meta"><span className="com-tag">{thread.category==="general"?"ΓΕΝΙΚΑ":thread.category==="advice"?"ΣΥΜΒΟΥΛΕΣ":"ΣΥΝΕΡΓΑΣΙΕΣ"}</span><span>{dateGR(thread.created_at)}</span></div>
    <h2>{thread.title}</h2><p>{thread.body}</p><p className="com-by">{businessName(data.businesses,thread.member_user_id)}</p>
    <div className="com-replies">{data.replies.filter(reply=>reply.thread_id===thread.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(reply=><div key={reply.id} className="com-reply"><div className="com-meta"><strong>{businessName(data.businesses,reply.member_user_id)}</strong><span>{dateGR(reply.created_at)}</span></div><p>{reply.body}</p></div>)}</div>
    {!thread.locked?<form action={replyThread} className="com-form"><input type="hidden" name="thread_id" value={thread.id}/><label>Η απάντησή σου<textarea name="body" required minLength={2} maxLength={2000} rows={3}/></label><button className="com-button">Απάντηση ↗</button></form>:<p>Η συζήτηση έχει κλείσει.</p>}
    <details className="com-report"><summary>Αναφορά συζήτησης</summary><form action={reportContent}><input type="hidden" name="resource_type" value="thread"/><input type="hidden" name="resource_id" value={thread.id}/><textarea name="reason" required minLength={20} maxLength={500}/><button className="com-minor">Αναφορά</button></form></details>
   </article>):<div className="com-empty">Η κοινότητα δεν έχει ανοίξει ακόμη συζητήσεις.</div>}</section>
   <aside className="com-side"><h2>Ξεκίνα μια συζήτηση</h2><p>Μοιράσου μια πραγματική ερώτηση ή μια ευκαιρία συνεργασίας.</p><form action={createThread} className="com-form">
    <label>Θεματική<select name="category"><option value="general">Γενική συζήτηση</option><option value="advice">Συμβουλές</option><option value="collaboration">Συνεργασίες</option></select></label>
    <label>Τίτλος<input name="title" required minLength={8} maxLength={140}/></label>
    <label>Περιεχόμενο<textarea name="body" required minLength={30} maxLength={4000} rows={7}/></label><button className="com-button">Δημιουργία θέματος ↗</button>
   </form></aside>
  </div></main>;
}

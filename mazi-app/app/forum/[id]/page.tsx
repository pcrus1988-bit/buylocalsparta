import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest} from "../../../lib/mazi-api";
import {formattedDate,forumCategories,type MaziForumThread,type MaziForumReply} from "../../../lib/mazi-community";
import {replyMaziThread} from "../../community-actions";
import {MaziCommunityNav} from "../../community-nav";
import s from "../../community.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Συζήτηση · Forum ΜΑΖΙ",robots:{index:false,follow:false}};
export default async function Thread({params,searchParams}:{
 params:Promise<{id:string}>;searchParams:Promise<{notice?:string;page?:string}>
}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))
  return <main id="content" className={s.stage}><div className={s.shell}>Δεν βρέθηκε η συζήτηση. <Link href="/forum">Forum</Link></div></main>;
 const {notice,page:rawPage}=await searchParams;
 const page=/^(0|[1-9][0-9]{0,1})$/.test(rawPage||"0")?Number(rawPage||0):0;
 const result=await maziMemberRequest<{thread:MaziForumThread;replies:MaziForumReply[];has_older:boolean}>("forum_thread",{thread_id:id,page});
 return <main id="content" className={s.stage}><div className={s.shell}>
  <MaziCommunityNav/>
  {!result.ok?<section className={s.warn}><h2>Δεν υπάρχει πρόσβαση σε αυτή τη συζήτηση</h2><Link href="/forum">Επιστροφή στο Forum</Link></section>:<div className={s.oneColumn}>
    {notice==="created"||notice==="replied"?<p className={s.notice} role="status">Το μήνυμά σου δημοσιεύτηκε.</p>:null}
    {notice==="not_saved"?<p className={s.warn} role="alert">Δεν δημοσιεύτηκε απάντηση. Έλεγξε το περιεχόμενο και τα όρια δημοσίευσης.</p>:null}
    <article className={s.entry}><span className={s.tag}>{forumCategories[result.thread.category]}</span>
     <h1>{result.thread.title}</h1>
     <p className={s.meta}>{result.thread.author_business_name} · {formattedDate(result.thread.created_at)}</p>
     <p className={s.body}>{result.thread.body}</p>
     <div className={s.footerLine}><Link className={s.reportLink} href={`/community/report?resource_type=thread&resource_id=${result.thread.id}`}>Αναφορά συζήτησης</Link></div>
    </article>
    <section className={s.feed} style={{marginTop:25}}><h2>Απαντήσεις · Σελίδα {page+1}</h2>
     {!result.replies.length?<p className={s.empty}>Δεν υπάρχουν ακόμη απαντήσεις.</p>:result.replies.map(reply=>
       <article className={s.entry} key={reply.id}>
        <p className={s.meta}><strong>{reply.author_business_name}</strong> · {formattedDate(reply.created_at)}</p>
        <p className={s.body}>{reply.body}</p>
        <Link className={s.reportLink} href={`/community/report?resource_type=reply&resource_id=${reply.id}`}>Αναφορά απάντησης</Link>
       </article>)}
      <nav className={s.pagination} aria-label="Ιστορικό απαντήσεων">{result.has_older&&page<99?<Link className={s.minor} href={`/forum/${id}?page=${page+1}`}>← Παλαιότερες απαντήσεις</Link>:<span/>}{page>0?<Link className={s.minor} href={page===1?`/forum/${id}`:`/forum/${id}?page=${page-1}`}>Νεότερες απαντήσεις →</Link>:null}</nav>
    </section>
    {result.thread.locked?<p className={s.warn}>Η συζήτηση είναι κλειδωμένη. Δεν επιτρέπονται νέες απαντήσεις.</p>:
     <section className={s.panel} style={{marginTop:25}}><h2>Γράψε απάντηση</h2>
      <form className={s.form} action={replyMaziThread}>
       <input type="hidden" name="thread_id" value={result.thread.id}/>
       <label>Μήνυμα<textarea name="body" required minLength={2} maxLength={2000} rows={5} placeholder="Γράψε με σεβασμό προς τις άλλες επιχειρήσεις."/></label>
       <button className={s.action} type="submit">Δημοσίευση απάντησης ↗</button>
      </form>
     </section>}
   </div>}
 </div></main>;
}
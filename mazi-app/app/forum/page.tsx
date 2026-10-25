import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {formattedDate,forumCategories,type MaziForumThread} from "../../lib/mazi-community";
import {publishMaziThread} from "../community-actions";
import {MaziCommunityNav} from "../community-nav";
import s from "../community.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Forum επιχειρήσεων",robots:{index:false,follow:false}};
export default async function Forum({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziMemberRequest<{threads:MaziForumThread[]}>("forum_list");
 const {notice}=await searchParams;
 return <main id="content" className={s.stage}><div className={s.shell}>
  <section className={s.intro}><span className={s.eyebrow}>ΜΑΖΙ / ΣΥΛΛΟΓΙΚΗ ΓΝΩΣΗ</span>
   <h1>Forum <em>επιχειρήσεων.</em></h1>
   <p>Ρώτησε, μοιράσου εμπειρία και βρες συνεργάτες ανάμεσα σε πραγματικά επαληθευμένα μέλη.</p>
  </section><MaziCommunityNav/>
  {!result.ok?<div className={s.warn}><h2>Ο χώρος συζητήσεων δεν είναι διαθέσιμος</h2>
    <p>Οι συζητήσεις είναι διαθέσιμες μόνο σε εγκεκριμένες επιχειρήσεις με επαληθευμένο ΓΕΜΗ.</p><Link href="/members">Έλεγξε τη συμμετοχή σου ↗</Link>
   </div>:<>
   {notice==="not_saved"?<p className={s.warn} role="alert">Η δημοσίευση απέτυχε ή ισχύει περιορισμός συχνότητας.</p>:null}
   <div className={s.columns}><section className={s.panel}>
    <h2>Νέα συζήτηση</h2><form className={s.form} action={publishMaziThread}>
     <label>Θεματική<select name="category" required><option value="general">Γενική συζήτηση</option><option value="advice">Συμβουλές</option><option value="collaboration">Συνεργασίες</option></select></label>
     <label>Τίτλος<input name="title" required minLength={8} maxLength={140} placeholder="Τι θέλεις να συζητήσουμε;"/></label>
     <label>Μήνυμα<textarea name="body" required minLength={30} maxLength={4000} rows={8} placeholder="Περιέγραψε το θέμα σου με σεβασμό και χωρίς ευαίσθητα δεδομένα."/></label>
     <button className={s.action} type="submit">Άνοιγμα συζήτησης ↗</button>
    </form>
    <p className={s.hint}>Οι αναφορές παραβιάσεων αποστέλλονται για χειροκίνητο έλεγχο και δεν αποκρύπτονται αυτόματα.</p>
   </section>
   <section className={s.feed}><h2>Πρόσφατες συζητήσεις ({result.threads.length})</h2>
    {!result.threads.length?<div className={s.empty}>Δεν έχουν ξεκινήσει ακόμη συζητήσεις.</div>:result.threads.map(item=>
      <article key={item.id} className={s.entry}>
       <div className={s.tags}><span className={s.tag}>{forumCategories[item.category]}</span>{item.locked?<span className={s.tag}>Κλειδωμένη</span>:null}</div>
       <h3><Link className={s.threadLink} href={`/forum/${item.id}`}>{item.title}</Link></h3>
       <p className={s.meta}>{item.author_business_name} · {formattedDate(item.created_at)}</p>
       <p className={s.body}>{item.body.length>300?item.body.slice(0,300)+"…":item.body}</p>
       <Link className={s.minor} href={`/forum/${item.id}`}>Διάβασε και απάντησε ↗</Link>
      </article>
    )}
   </section></div>
  </>}
 </div></main>;
}
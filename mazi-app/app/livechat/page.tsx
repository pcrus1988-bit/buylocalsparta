import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest} from "../../lib/mazi-api";
import {formattedDate,type MaziChatMessage} from "../../lib/mazi-community";
import {sendMaziChat} from "../community-actions";
import {MaziCommunityNav} from "../community-nav";
import LiveChatRefresh from "./live-chat-refresh";
import s from "../community.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Livechat μελών",robots:{index:false,follow:false}};
export default async function Livechat({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const result=await maziMemberRequest<{messages:MaziChatMessage[]}>("chat_list");
 const {notice}=await searchParams;
 return <main id="content" className={s.stage}><div className={s.shell}>
   <section className={s.intro}><span className={s.eyebrow}>ΜΑΖΙ / ΖΩΝΤΑΝΗ ΚΟΙΝΟΤΗΤΑ</span>
    <h1>Livechat <em>μελών.</em></h1>
    <p>Ο κοινός χώρος άμεσης συζήτησης πραγματικών, επαληθευμένων ελληνικών επιχειρήσεων. Μην αποκαλύπτεις προσωπικά δεδομένα ή εμπιστευτικές εμπορικές πληροφορίες.</p>
   </section><MaziCommunityNav/>
   {!result.ok?<section className={s.warn}><h2>Δεν είναι διαθέσιμη η συνομιλία</h2>
    <p>Απαιτείται επαληθευμένη συμμετοχή ή προσωρινά δεν είναι διαθέσιμη η υπηρεσία.</p>
    <Link href="/members">Κατάσταση μέλους ↗</Link>
   </section>:<div className={s.oneColumn}>
    {notice==="sent"?<p className={s.notice} role="status">Το μήνυμά σου καταχωρίστηκε.</p>:null}
    {notice==="not_saved"?<p className={s.warn} role="alert">Δεν στάλθηκε μήνυμα. Έλεγξε το κείμενο και το όριο συχνότητας.</p>:null}
    <section className={s.panel} aria-label="Συνομιλία μελών">
     <div className={s.split}><h2>Κεντρική συζήτηση</h2><LiveChatRefresh/></div>
     <div className={s.chatWindow} role="log" aria-label="Πρόσφατα μηνύματα κοινότητας">
      {!result.messages.length?<p className={s.empty}>Δεν έχουν σταλεί ακόμη πραγματικά μηνύματα μελών.</p>:
       result.messages.map(item=><article key={item.id} className={s.chatBubble+(item.is_mine?" "+s.chatMine:"")}>
        <p className={s.meta}><strong>{item.author_business_name}</strong> · {formattedDate(item.created_at)}</p>
        <p className={s.body}>{item.body}</p>
        <Link className={s.reportLink} href={`/community/report?resource_type=chat&resource_id=${item.id}`}>Αναφορά</Link>
       </article>)}
     </div>
     <form className={s.form+" "+s.messageBar} action={sendMaziChat}>
      <label>Νέο μήνυμα<textarea name="body" required minLength={1} maxLength={1000} rows={3} placeholder="Γράψε στην κοινότητα…"/></label>
      <button className={s.action} type="submit">Αποστολή ↗</button>
     </form>
     <p className={s.hint}>Οι συνομιλίες ανανεώνονται περίπου κάθε 8 δευτερόλεπτα όσο η σελίδα είναι ανοιχτή. Δεν είναι κρυπτογραφημένη ιδιωτική συνομιλία.</p>
    </section>
   </div>}
 </div></main>;
}
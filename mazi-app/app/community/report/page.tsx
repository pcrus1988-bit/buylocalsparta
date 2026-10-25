import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {reportMaziCommunity} from "../../community-actions";
import {MaziCommunityNav} from "../../community-nav";
import s from "../../community.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Αναφορά περιεχομένου · ΜΑΖΙ",robots:{index:false,follow:false}};
export default async function Report({searchParams}:{
 searchParams:Promise<{resource_type?:string;resource_id?:string;notice?:string}>
}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const q=await searchParams,kind=q.resource_type||"",id=q.resource_id||"";
 const valid=["listing","thread","reply","chat"].includes(kind)&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 return <main id="content" className={s.stage}><div className={s.shell}>
  <MaziCommunityNav/><div className={s.oneColumn}><section className={s.panel}>
   <h1>Αναφορά περιεχομένου</h1>
   {!valid?<p className={s.warn}>Επίλεξε συγκεκριμένη ανάρτηση, απάντηση ή μήνυμα για να υποβάλεις αναφορά.</p>:<>
    <p>Οι αναφορές διαβάζονται από αρμόδιο διαχειριστή. Η υποβολή δεν αποκρύπτει αυτόματα το περιεχόμενο.</p>
    {q.notice==="not_saved"?<p className={s.warn} role="alert">Η αναφορά δεν υποβλήθηκε ή έχει ήδη καταχωριστεί.</p>:null}
    <form action={reportMaziCommunity} className={s.form}>
      <input type="hidden" name="resource_type" value={kind}/>
      <input type="hidden" name="resource_id" value={id}/>
      <label>Γιατί αναφέρεις το περιεχόμενο;<textarea name="reason" rows={5} required minLength={20} maxLength={500} placeholder="Περιέγραψε συγκεκριμένα την παραβίαση (20–500 χαρακτήρες)."/></label>
      <button className={s.action} type="submit">Υποβολή αναφοράς ↗</button>
    </form>
   </>}
  </section></div>
 </div></main>;
}
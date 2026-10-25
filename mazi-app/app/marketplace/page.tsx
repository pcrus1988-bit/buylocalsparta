import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {getCommunity,businessName,dateGR} from "../../lib/community";
import {createListing,closeListing,startInquiry,reportContent} from "../community-actions";
import "../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Αγορά συνεργασίας",robots:{index:false,follow:false}};
export default async function Marketplace({searchParams}:{searchParams:Promise<{notice?:string;kind?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const result=await getCommunity("marketplace");if(!result.ok)return <main id="content" className="com-shell"><h1>Η αγορά δεν είναι διαθέσιμη.</h1><p>Απαιτείται εγκεκριμένη συμμετοχή ή προσωρινά δεν υπάρχει σύνδεση.</p><Link href="/dashboard">Ο χώρος μου</Link></main>;
 const params=await searchParams;
 const records=result.listings.filter(x=>params.kind==="offer"||params.kind==="request"?x.kind===params.kind:true);
 return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / ΑΓΟΡΑ ΜΕΛΩΝ</span><h1>Μαζί <em>συνεργαζόμαστε.</em></h1><p>Πραγματικές προσφορές, ανάγκες και συνέργειες μεταξύ επαληθευμένων επιχειρήσεων.</p></div><div><Link href="/inbox" className="com-back">Μηνύματα ↗</Link> <Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div></div>
  <div className="com-alert">Επαγγελματική δικτύωση μόνο. Δεν πραγματοποιούνται παραγγελίες, πληρωμές ή εγγυημένες συναλλαγές μέσω ΜΑΖΙ.</div>
  {params.notice?<p className="com-feedback" role="status">{params.notice==="saved"?"Η ενέργεια καταχωρίστηκε.":params.notice==="rate_limited"?"Προσπάθησε ξανά σε λίγο.":"Δεν ολοκληρώθηκε η ενέργεια."}</p>:null}
  <div className="com-grid"><section><div className="com-tabs"><Link href="/marketplace">Όλες</Link><Link href="/marketplace?kind=offer">Προσφορές</Link><Link href="/marketplace?kind=request">Αναζητήσεις</Link></div>
   <div className="com-list">{records.length?records.map(item=><article key={item.id} className="com-card">
    <div className="com-meta"><span className="com-tag">{item.kind==="offer"?"ΠΡΟΣΦΕΡΩ":"ΑΝΑΖΗΤΩ"}</span><span>{dateGR(item.created_at)}</span></div>
    <h2>{item.title}</h2><p>{item.description}</p><div className="com-meta"><strong>{businessName(result.businesses,item.member_user_id)}</strong><span>{item.category==="goods"?"Προϊόντα":item.category==="services"?"Υπηρεσίες":"Συνεργασίες"}</span></div>
    {item.member_user_id===user.id&&item.status==="active"?<form action={closeListing}><input type="hidden" name="id" value={item.id}/><button className="com-minor">Κλείσιμο καταχώρισης</button></form>:null}
    {item.status==="closed"?<span className="com-tag">Ολοκληρώθηκε</span>:null}
    {item.member_user_id!==user.id&&item.status==="active"?<details className="com-report"><summary>Επικοινώνησε ιδιωτικά με την επιχείρηση</summary>
      <form action={startInquiry} className="com-form"><input type="hidden" name="listing_id" value={item.id}/>
       <label>Μήνυμα ενδιαφέροντος<textarea name="body" required minLength={20} maxLength={1500} rows={4} placeholder="Πες τι σε ενδιαφέρει και πώς μπορείτε να συνεργαστείτε." /></label>
       <button className="com-button">Αποστολή ιδιωτικού αιτήματος ↗</button>
      </form><p className="small-muted">Μία αρχική επικοινωνία ανά καταχώριση. Συνέχεια από τα μηνύματά σου.</p>
     </details>:null}
    {item.member_user_id!==user.id?<details className="com-report"><summary>Αναφορά περιεχομένου</summary><form action={reportContent}><input type="hidden" name="resource_type" value="listing"/><input type="hidden" name="resource_id" value={item.id}/><textarea required minLength={20} maxLength={500} name="reason" placeholder="Περιέγραψε τον λόγο αναφοράς"/><button className="com-minor">Αποστολή αναφοράς</button></form></details>:null}
   </article>):<p className="com-empty">Δεν υπάρχουν ακόμη καταχωρίσεις με αυτά τα κριτήρια.</p>}</div>
  </section><aside className="com-side"><h2>Νέα καταχώριση</h2><p>Πες στα υπόλοιπα μέλη τι προσφέρεις ή τι χρειάζεσαι.</p><form action={createListing} className="com-form">
    <label>Τύπος<select name="kind"><option value="offer">Προσφέρω</option><option value="request">Αναζητώ</option></select></label>
    <label>Κατηγορία<select name="category"><option value="goods">Προϊόντα</option><option value="services">Υπηρεσίες</option><option value="partnerships">Συνεργασίες</option></select></label>
    <label>Τίτλος<input name="title" required minLength={8} maxLength={140}/></label>
    <label>Περιγραφή<textarea name="description" required minLength={30} maxLength={2500} rows={6}/></label>
    <button className="com-button">Δημοσίευση ↗</button>
  </form></aside></div>
 </main>;
}

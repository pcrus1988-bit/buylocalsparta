import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {getCommunity} from "../../lib/community";
import ChatRoom from "./chat-room";
import "../community.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ζωντανή συνομιλία",robots:{index:false,follow:false}};
export default async function LiveChat({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const initial=await getCommunity("chat");
 if(!initial.ok)return <main id="content" className="com-shell"><h1>Η συνομιλία δεν είναι διαθέσιμη.</h1><Link href="/dashboard">Ο χώρος μου</Link></main>;
 return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">ΜΑΖΙ / LIVECHAT</span><h1>Η συζήτηση <em>συνεχίζεται.</em></h1><p>Μια κοινή ζωντανή αίθουσα επικοινωνίας για επαληθευμένα μέλη.</p></div><Link href="/dashboard" className="com-back">← Ο χώρος μου</Link></div>
  <div className="com-alert">Τα μηνύματα είναι ορατά σε όλα τα επαληθευμένα μέλη. Μην αναρτάς προσωπικά δεδομένα πελατών ή εμπιστευτικές πληροφορίες. Η συνομιλία ανανεώνεται αυτόματα.</div>
  {(await searchParams).notice?<p className="com-feedback" role="status">Η αναφορά καταχωρίστηκε ή εξετάζεται. Έλεγξε την κατάσταση αργότερα.</p>:null}
  <ChatRoom initialMessages={initial.messages} initialBusinesses={initial.businesses} currentUserId={user.id}/>
 </main>;
}

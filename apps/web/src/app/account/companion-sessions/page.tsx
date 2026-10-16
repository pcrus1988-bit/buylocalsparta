import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {SiteHeader} from "../../../components/SiteHeader";
import {AccountSectionNavigation} from "../../../components/AccountSectionNavigation";
import {getAccountSession} from "../../../lib/account-session";
import {companionEnabled,customerCompanionSessions} from "../../../lib/companion-mobile-auth";
export const metadata:Metadata={title:"Συνδεδεμένες συσκευές Companion",robots:{index:false,follow:false}};
export default async function CompanionSessions(){
 const principal=await getAccountSession();
 if(!principal)redirect("/login?next=/account/companion-sessions");
 const sessions=companionEnabled()?await customerCompanionSessions(principal):[];
 return <main className="account-app">
  <SiteHeader compact/><AccountSectionNavigation/>
  <section className="shell customer-account-page" style={{maxWidth:880,paddingBottom:60}}>
   <div className="eyebrow">Ασφάλεια · Companion Android</div>
   <h1>Συνδεδεμένες συσκευές Companion</h1>
   <p>Εδώ μπορείς να αφαιρέσεις την πρόσβαση μιας συσκευής στην εφαρμογή χωρίς να αλλάξει η σύνδεσή σου στο website.</p>
   {!companionEnabled()&&<p>Η υπηρεσία Companion δεν έχει ακόμη ενεργοποιηθεί.</p>}
   {companionEnabled()&&sessions.length===0&&<p>Δεν υπάρχουν ενεργές συνδέσεις Android Companion.</p>}
   {sessions.map(s=><article key={s.id} className="customer-account-panel" style={{marginBottom:14}}>
     <h2>Android Companion</h2>
     <p>Σύνδεση: {new Date(s.createdAt).toLocaleString("el-GR")}</p>
     <p>Τελευταία ανανέωση: {new Date(s.lastUsedAt).toLocaleString("el-GR")}</p>
     <p>Λήξη ανανέωσης: {new Date(s.expiresAt).toLocaleString("el-GR")}</p>
     <form method="post" action="/api/account/companion-sessions/revoke">
      <input type="hidden" name="session_id" value={s.id}/>
      <input type="hidden" name="csrf_token" value={principal.csrfToken}/>
      <button className="button button-secondary" type="submit">Ανάκληση πρόσβασης Android</button>
     </form>
   </article>)}
   <Link className="button button-secondary" href="/account/security">Πίσω στην ασφάλεια λογαριασμού</Link>
  </section>
 </main>;
}

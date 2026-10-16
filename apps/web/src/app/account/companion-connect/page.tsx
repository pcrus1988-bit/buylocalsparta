import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAccountSession} from "../../../lib/account-session";
import {companionEnabled,validChallenge,validClient,validState,
  COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI} from "../../../lib/companion-mobile-auth";

export const metadata:Metadata={title:"Σύνδεση KONTA MOY Companion",robots:{index:false,follow:false}};
type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
const first=(v:string|string[]|undefined)=>typeof v==="string"?v:"";
export default async function CompanionConnect({searchParams}:Props){
 const q=await searchParams;
 const challenge=first(q.code_challenge),state=first(q.state);
 const client=first(q.client_id),redir=first(q.redirect_uri);
 const valid=validChallenge(challenge)&&validState(state)
    &&first(q.code_challenge_method)==="S256"
    &&first(q.response_type)==="code"
    &&validClient(client,redir);
 const user=await getAccountSession();
 if(!user && valid){
   const next=`/account/companion-connect?${new URLSearchParams({
     code_challenge:challenge,code_challenge_method:"S256",response_type:"code",
     state,client_id:client,redirect_uri:redir
   }).toString()}`;
   redirect(`/login?next=${encodeURIComponent(next)}`);
 }
 if(!valid || !companionEnabled())return <main className="shell" style={{padding:"40px 18px"}}>
    <h1>Σύνδεση Companion</h1><p>Η σύνδεση της εφαρμογής δεν είναι διαθέσιμη αυτή τη στιγμή.</p>
    <a href="/account">Επιστροφή στον λογαριασμό</a>
 </main>;
 return <main className="shell" style={{padding:"48px 18px",maxWidth:650}}>
  <div className="eyebrow">KONTA MOY COMPANION · ANDROID</div>
  <h1>Σύνδεσε με ασφάλεια την εφαρμογή σου</h1>
  <p>Η εφαρμογή Companion θα μπορεί να εμφανίζει τα στοιχεία λογαριασμού σου, τις παραγγελίες και τη wishlist σου. Δεν θα λάβει τον κωδικό πρόσβασης ή τα cookies του browser.</p>
  <p><strong>Συνδεδεμένος λογαριασμός:</strong> {user?.email}</p>
  <p>Δίνεται πρόσβαση μόνο στα δικά σου δεδομένα. Μπορείς να αποσυνδέσεις την εφαρμογή και να ανακαλέσεις τα διακριτικά πρόσβασης οποιαδήποτε στιγμή.</p>
  <form method="post" action="/api/mobile/companion/auth/authorize">
    <input type="hidden" name="code_challenge" value={challenge}/>
    <input type="hidden" name="state" value={state}/>
    <input type="hidden" name="client_id" value={COMPANION_CLIENT_ID}/>
    <input type="hidden" name="redirect_uri" value={COMPANION_REDIRECT_URI}/>
    <input type="hidden" name="csrf_token" value={user?.csrfToken??""}/>
    <button className="button" type="submit">Έγκριση σύνδεσης Companion</button>
  </form>
  <a style={{display:"inline-block",marginTop:24}} href="/account">Ακύρωση</a>
 </main>;
}

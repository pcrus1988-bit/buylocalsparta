"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
export function FiscalInvitationAccept(){
 const [token,setToken]=useState("");
 const [password,setPassword]=useState("");
 const [confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [completed,setCompleted]=useState(false);
 useEffect(()=>{
  // The one-time secret is in the URL fragment: HTTP requests, Referer headers
  // and Vercel CDN logs never contain it. Erase it from the address bar immediately.
  const fragment=window.location.hash.slice(1);
  if(/^[a-f0-9]{64}$/.test(fragment))setToken(fragment);
  window.history.replaceState(null,"",window.location.pathname);
 },[]);
 async function accept(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  if(password!==confirm){setError("Οι κωδικοί δεν ταιριάζουν.");return;}
  setBusy(true);setError("");
  try{
   const response=await fetch("/timologio/api/invitations/redeem",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},body:JSON.stringify({token,password})
   });
   const result=await response.json() as {pendingReview?:boolean;error?:string};
   if(!response.ok||!result.pendingReview){
    throw Error(result.error==="INVITATION_INVALID_OR_EXPIRED"?
     "Η πρόσκληση έχει λήξει, ανακληθεί ή χρησιμοποιηθεί ήδη. Επικοινωνήστε με τον διαχειριστή.":
     result.error==="INVITATIONS_DISABLED"?"Η αποδοχή προσκλήσεων δεν είναι ενεργή.":result.error??"Η εγγραφή απέτυχε.");
   }
   setCompleted(true);setToken("");setPassword("");setConfirm("");
  }catch(e){setError(e instanceof Error?e.message:"Η εγγραφή απέτυχε.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section" style={{maxWidth:640}}>
  {completed?<><h2>Η αίτηση καταχωρίστηκε</h2>
   <p>Ο λογαριασμός δημιουργήθηκε ως <strong>εκκρεμής έλεγχος</strong>. Τα email, η ταυτότητα του νόμιμου εκπροσώπου και τα εταιρικά στοιχεία δεν έχουν ακόμα επιβεβαιωθεί.</p>
   <p><Link className="fiscal-button" href="/timologio/login">Σύνδεση FISCAL</Link></p>
  </>:!token?<><h2>Δεν βρέθηκε ενεργός κωδικός πρόσκλησης</h2>
   <p>Ανοίξτε ξανά τον αρχικό, προσωπικό σύνδεσμο. Δεν επιτρέπεται δημόσια εγγραφή.</p></>:
   <><h2>Δημιουργήστε ιδιωτικό κωδικό πρόσβασης</h2>
    <p>Η επωνυμία, το email και το ΑΦΜ έχουν δεσμευτεί από την πρόσκληση. Η κατοχή του συνδέσμου δεν συνιστά νομική ή φορολογική επαλήθευση.</p>
    <form className="fiscal-form" onSubmit={accept} style={{maxWidth:"100%"}}>
     <label>Κωδικός πρόσβασης (12–256 χαρακτήρες)
      <input type="password" required minLength={12} maxLength={256} autoComplete="new-password"
       value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/>
     </label>
     <label>Επιβεβαίωση κωδικού
      <input type="password" required minLength={12} maxLength={256} autoComplete="new-password"
       value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/>
     </label>
     <button type="submit" className="fiscal-button" disabled={busy}>{busy?"Καταχώριση…":"Αποδοχή πρόσκλησης"}</button>
    </form>
   </>}
  {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
  <p className="fiscal-alert">Η δημιουργία λογαριασμού δεν επιτρέπει έκδοση, myDATA, πληρωμές ή συναλλαγές. Ακολουθεί χειροκίνητος έλεγχος.</p>
 </section>;
}

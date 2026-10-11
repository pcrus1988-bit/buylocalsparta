"use client";
import Link from "next/link";
import {useEffect,useState} from "react";

export function FiscalEmailVerificationRequest({csrfToken,verified,enabled}:{
 csrfToken:string;verified:boolean;enabled:boolean
}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function requestProof(){
  if(busy||verified||!enabled)return;
  setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch("/timologio/api/email-verification",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action:"request"})
   });
   const result=await response.json() as {sent?:boolean;alreadyVerified?:boolean;error?:string};
   if(!response.ok||(!result.sent&&!result.alreadyVerified))
    throw Error(result.error??"Δεν ήταν δυνατή η αποστολή του μηνύματος.");
   setMessage(result.alreadyVerified?"Το email έχει ήδη επαληθευτεί.":
    "Το μήνυμα δόθηκε στον πάροχο αποστολής. Ελέγξτε τα εισερχόμενα και το spam μέσα σε 20 λεπτά.");
  }catch(e){setError(e instanceof Error?e.message:"Αδυναμία αποστολής.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
  <h2>Επιβεβαίωση email</h2>
  {verified?<p>Η διεύθυνση email έχει επιβεβαιωθεί. Η νομική εκπροσώπηση και τα εταιρικά στοιχεία παραμένουν υπό ξεχωριστό έλεγχο.</p>:
   enabled?<><p>Επιβεβαιώστε ότι ελέγχετε τη διεύθυνση του λογαριασμού σας. Ο σύνδεσμος ισχύει για 20 λεπτά και δεν ενεργοποιεί τιμολόγηση.</p>
    <button className="fiscal-button" type="button" disabled={busy} onClick={requestProof}>{busy?"Αποστολή…":"Αποστολή συνδέσμου επιβεβαίωσης"}</button></>:
   <p className="fiscal-alert">Η αποστολή επιβεβαίωσης email δεν έχει ενεργοποιηθεί ακόμη.</p>}
  {message?<p role="status">{message}</p>:null}
  {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
 </section>;
}
export function FiscalEmailVerificationClaim(){
 const [token,setToken]=useState("");
 const [status,setStatus]=useState<"pending"|"done">("pending");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const hash=window.location.hash.slice(1);
  if(/^[a-f0-9]{64}$/.test(hash))setToken(hash);
  window.history.replaceState(null,"",window.location.pathname);
 },[]);
 async function claim(){
  if(busy||!token)return;
  setBusy(true);setError("");
  try{
   // Fetch a fresh, session-scoped CSRF value so the user can log in
   // in another tab without exposing the proof in a redirect URL.
   const auth=await fetch("/timologio/api/email-verification",{
    method:"GET",cache:"no-store",credentials:"same-origin"
   });
   if(!auth.ok)throw Error("Συνδεθείτε σε άλλη καρτέλα και επιστρέψτε εδώ.");
   const {csrfToken}=await auth.json() as {csrfToken?:string};
   if(!csrfToken)throw Error("Δεν βρέθηκε ενεργή συνεδρία.");
   const response=await fetch("/timologio/api/email-verification",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action:"confirm",token})
   });
   const result=await response.json() as {emailVerified?:boolean;error?:string};
   if(!response.ok||!result.emailVerified)
    throw Error(result.error==="EMAIL_PROOF_EXPIRED_OR_USED"
     ?"Ο σύνδεσμος έληξε ή χρησιμοποιήθηκε ήδη. Ζητήστε νέο από τον πίνακα FISCAL."
     :result.error??"Η επιβεβαίωση απέτυχε.");
   setToken("");setStatus("done");
  }catch(e){setError(e instanceof Error?e.message:"Η επιβεβαίωση απέτυχε.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section" style={{maxWidth:620}}>
  {status==="done"?<><h2>Το email επιβεβαιώθηκε</h2><p>Η επιβεβαίωση διεύθυνσης δεν σημαίνει έγκριση της επιχείρησης ή δικαίωμα έκδοσης παραστατικών.</p></>:
   token?<><h2>Επιβεβαίωση διεύθυνσης email</h2>
    <p>Συνδεθείτε στο δικό σας FISCAL λογαριασμό στην ίδια συσκευή. Αν χρειάζεται, ανοίξτε τη σύνδεση σε άλλη καρτέλα και επιστρέψτε εδώ.</p>
    <button className="fiscal-button" type="button" disabled={busy} onClick={claim}>{busy?"Έλεγχος…":"Επιβεβαίωση email"}</button></>:
   <><h2>Λείπει ο κωδικός επιβεβαίωσης</h2><p>Ανοίξτε εκ νέου τον προσωπικό σύνδεσμο που λάβατε μέσω email.</p></>}
  {error?<p className="fiscal-alert" role="alert">{error} <Link href="/timologio/login" target="_blank" rel="noopener noreferrer">Σύνδεση σε νέα καρτέλα</Link></p>:null}
  <p><Link href="/timologio/dashboard">Επιστροφή στον πίνακα FISCAL</Link></p>
 </section>;
}

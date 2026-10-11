"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";

type Status={setupEnabled:boolean;enforced:boolean;active:boolean;steppedUp:boolean};
export function FiscalOperatorMfaWorkbench({csrfToken,initial}:{
 csrfToken:string;initial:Status
}){
 const router=useRouter();
 const [status,setStatus]=useState(initial);
 const [secret,setSecret]=useState("");
 const [uri,setUri]=useState("");
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function submit(action:"start"|"activate"|"step_up"|"exit"){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/timologio-admin/api/mfa",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action,...(["activate","step_up"].includes(action)?{code}:{})})
   });
   const result=await response.json() as {
    error?:string;active?:boolean;steppedUp?:boolean;secret?:string;
    uri?:string;expiresMinutes?:number
   };
   if(!response.ok)throw Error(result.error??"Η επιβεβαίωση απέτυχε.");
   if(action==="start"){
    setSecret(result.secret??"");setUri(result.uri??"");
    setNotice("Καταχωρίστε το μυστικό στον authenticator και επιβεβαιώστε εντός 10 λεπτών.");
   }else{
    setSecret("");setUri("");setCode("");
    setStatus(previous=>({
     ...previous,active:result.active??previous.active,
     steppedUp:result.steppedUp??false
    }));
    setNotice(action==="exit"?"Η επιβεβαίωση δύο παραγόντων έληξε.":
      "Ο έλεγχος δύο παραγόντων ολοκληρώθηκε. Ισχύει για 15 λεπτά.");
    router.refresh();
   }
  }catch(e){setError(e instanceof Error?e.message:"Αδυναμία επαλήθευσης.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section" style={{maxWidth:740}}>
  <h2>Πρόσθετη προστασία διαχειριστή</h2>
  <p>Χρησιμοποιήστε εφαρμογή authenticator που υποστηρίζει κωδικούς TOTP 6 ψηφίων / 30 δευτερολέπτων. Δεν απαιτείται νέο login στο KONTA MOY.</p>
  <p>Κατάσταση: <strong>{status.active?"Authenticator ενεργός":"Δεν έχει ρυθμιστεί"}</strong>
    {" · "}Πρόσφατη επαλήθευση: <strong>{status.steppedUp?"Ναι":"Όχι"}</strong>
    {" · "}Υποχρεωτική επαλήθευση: <strong>{status.enforced?"Ναι":"Σε δοκιμαστική φάση"}</strong></p>
  {!status.setupEnabled?<p className="fiscal-alert">Η ρύθμιση MFA δεν έχει ενεργοποιηθεί ακόμη από τη διαχείριση της υπηρεσίας.</p>
    :!status.active?<div style={{display:"grid",gap:14}}>
     <p>Αποθηκεύστε το μυστικό αποκλειστικά σε εφαρμογή authenticator. Θα εμφανιστεί μόνο κατά την προετοιμασία, όχι ξανά μετά την ενεργοποίηση.</p>
     {!secret?<button type="button" disabled={busy} className="fiscal-button" onClick={()=>submit("start")}>Προσθήκη authenticator</button>
      :<div className="fiscal-card">
        <p><strong>Μυστικό κλειδί — προσωπικό, μη κοινοποιήσιμο</strong></p>
        <code style={{overflowWrap:"anywhere"}}>{secret}</code>
        <p>Ρυθμίστε λογαριασμό με αυτό το μυστικό ή εισαγάγετε το ακόλουθο URI στην εφαρμογή σας:</p>
        <textarea aria-label="URI για εφαρμογή authenticator" readOnly rows={4} value={uri} style={{width:"100%"}}/>
        <p className="fiscal-alert">Μην στείλετε, αποθηκεύσετε σε screenshot ή μοιραστείτε το μυστικό με άλλον διαχειριστή.</p>
       </div>}
     {secret?<label>Κωδικός επιβεβαίωσης
       <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6}
       value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
      </label>:null}
     {secret?<button className="fiscal-button" disabled={busy||code.length!==6} type="button" onClick={()=>submit("activate")}>Ενεργοποίηση MFA</button>:null}
    </div>
    :<div style={{display:"grid",gap:14}}>
      {!status.steppedUp?<><label>Κωδικός Authenticator
       <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6}
       value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
       </label><button className="fiscal-button" disabled={busy||code.length!==6} type="button"
        onClick={()=>submit("step_up")}>Επαλήθευση για 15 λεπτά</button></>
      :<button className="fiscal-button secondary" disabled={busy} type="button" onClick={()=>submit("exit")}>Λήξη επιβεβαίωσης τώρα</button>}
     </div>}
  {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  <p className="fiscal-muted">Η απώλεια του authenticator απαιτεί ξεχωριστή, ελεγχόμενη διαδικασία ανάκτησης. Δεν υποστηρίζεται αυτόματη επαναφορά.</p>
 </section>;
}

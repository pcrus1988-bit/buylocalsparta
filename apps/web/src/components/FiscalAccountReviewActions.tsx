"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";

type Action="start_review"|"record_follow_up"|"reject";
export function FiscalAccountReviewActions({organizationId,status,csrfToken}:{
 organizationId:string;status:string;csrfToken:string
}){
 const router=useRouter();
 const [note,setNote]=useState("");
 const [confirmReject,setConfirmReject]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 async function submit(action:Action){
  if(busy)return;
  setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch("/timologio-admin/api/accounts",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action,organizationId,...(action==="start_review"?{}:{note})})
   });
   const result=await response.json() as {error?:string;ok?:boolean;status?:string};
   if(!response.ok||!result.ok){
    if(result.error==="REVIEW_STATE_CONFLICT")throw Error("Η κατάσταση της αίτησης άλλαξε. Ανανεώστε τη σελίδα.");
    throw Error(result.error??"Η ενέργεια δεν ολοκληρώθηκε.");
   }
   setSuccess(action==="record_follow_up"
    ?"Η εσωτερική σημείωση καταγράφηκε. Δεν στάλθηκε μήνυμα στην επιχείρηση."
    :action==="reject"?"Η αίτηση απορρίφθηκε με καταγεγραμμένη αιτιολογία."
    :"Ο έλεγχος ξεκίνησε.");
   setNote("");setConfirmReject(false);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Αποτυχία καταχώρισης.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section">
  <h2>Έλεγχος αίτησης</h2>
  {status==="pending_review"?<>
   <p className="fiscal-muted">Ξεκινήστε τον εσωτερικό έλεγχο της επιχείρησης. Δεν αποτελεί έγκριση ή άδεια έκδοσης.</p>
   <button type="button" className="fiscal-button" disabled={busy} onClick={()=>submit("start_review")}>Έναρξη ελέγχου</button>
  </>:status==="under_review"?<>
   <p className="fiscal-muted">Οι σημειώσεις είναι εσωτερικές και αμετάβλητες. Δεν αποστέλλεται email ή ειδοποίηση στην επιχείρηση.</p>
   <label style={{display:"grid",gap:8}}>
    <span>Εσωτερική αιτιολογία / εκκρεμότητες (10–1.000 χαρακτήρες, τουλάχιστον 20 για απόρριψη)</span>
    <textarea value={note} onChange={e=>{setNote(e.target.value);setError("");}} maxLength={1000} rows={4} disabled={busy}
      placeholder="Καταγράψτε ποιο δικαιολογητικό ή ποια ταυτοποίηση εκκρεμεί…"/>
   </label>
   <p className="fiscal-muted">{note.trim().length}/1.000 χαρακτήρες</p>
   <div className="fiscal-actions">
    <button className="fiscal-button" type="button" disabled={busy||note.trim().length<10}
     onClick={()=>submit("record_follow_up")}>{busy?"Επεξεργασία…":"Καταγραφή εσωτερικής εκκρεμότητας"}</button>
   </div>
   <div className="fiscal-card" style={{marginTop:18}}>
    <h3>Απόρριψη αίτησης</h3>
    <p>Η απόρριψη τερματίζει τον συγκεκριμένο κύκλο ελέγχου. Δεν υπάρχει αυτόματη επανενεργοποίηση ή ειδοποίηση.</p>
    <label style={{display:"flex",alignItems:"center",gap:8}}>
     <input type="checkbox" checked={confirmReject} onChange={e=>setConfirmReject(e.target.checked)} disabled={busy}/>
     Επιβεβαιώνω ότι θέλω να απορρίψω αυτή την αίτηση.
    </label>
    <div className="fiscal-actions"><button type="button" className="fiscal-button secondary"
      disabled={busy||!confirmReject||note.trim().length<20}
      onClick={()=>submit("reject")}>Οριστική απόρριψη αίτησης</button></div>
   </div>
  </>:<p className="fiscal-muted">Η κατάσταση <strong>{status}</strong> είναι μόνο για ανάγνωση. Η έγκριση απαιτεί ξεχωριστό, επαληθευμένο KYB και κανονιστικούς ελέγχους.</p>}
  {error?<p className="fiscal-alert" role="alert">{error}</p>:null}
  {success?<p role="status">{success}</p>:null}
  <p className="fiscal-alert">Δεν υπάρχει δυνατότητα έγκρισης εμπόρου, αλλαγής φορολογικής ταυτότητας ή έκδοσης παραστατικού σε αυτή τη σελίδα.</p>
 </section>;
}

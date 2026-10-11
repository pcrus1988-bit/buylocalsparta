"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";
export function FiscalInvitationWorkbench({csrfToken}:{csrfToken:string}){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [legalName,setLegalName]=useState("");
 const [vatNumber,setVatNumber]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [inviteUrl,setInviteUrl]=useState("");
 const [expiry,setExpiry]=useState("");
 async function issue(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");setInviteUrl("");setExpiry("");
  try{
   const response=await fetch("/timologio-admin/api/invitations",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action:"issue",email,legalName,vatNumber})
   });
   const result=await response.json() as {url?:string;expiresAt?:string;error?:string};
   if(!response.ok||!result.url)throw Error(result.error??"Δεν ήταν δυνατή η δημιουργία.");
   setInviteUrl(result.url);setExpiry(result.expiresAt??"");
   setEmail("");setLegalName("");setVatNumber("");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Αποτυχία δημιουργίας.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section">
  <h2>Νέα ιδιωτική πρόσκληση εμπόρου</h2>
  <p>Η πρόσκληση ισχύει για 48 ώρες. Δεσμεύει τη διεύθυνση email, επωνυμία και ΑΦΜ. Δεν αποστέλλεται email αυτόματα και δεν αποδεικνύει ταυτότητα ή έλεγχο ΓΕΜΗ/ΑΑΔΕ.</p>
  <form onSubmit={issue} className="fiscal-form" style={{maxWidth:660}}>
   <label>Email παραλήπτη<input type="email" autoComplete="off" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
   <label>Νομική επωνυμία<input maxLength={240} required value={legalName} onChange={e=>setLegalName(e.target.value)} disabled={busy}/></label>
   <label>ΑΦΜ (9 ψηφία)<input inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required value={vatNumber} onChange={e=>setVatNumber(e.target.value)} disabled={busy}/></label>
   <button className="fiscal-button" type="submit" disabled={busy}>{busy?"Δημιουργία…":"Δημιουργία εφάπαξ πρόσκλησης"}</button>
  </form>
  {error?<p className="fiscal-alert" role="alert">{error}</p>:null}
  {inviteUrl?<section className="fiscal-card" role="status">
   <h3>Η πρόσκληση δημιουργήθηκε</h3>
   <p>Αντιγράψτε τον σύνδεσμο τώρα. <strong>Δεν θα εμφανιστεί ξανά.</strong> Επικοινωνήστε με τον συγκεκριμένο παραλήπτη μέσω ήδη επαληθευμένου, ασφαλούς καναλιού· μην τον δημοσιεύσετε.</p>
   <textarea readOnly rows={4} aria-label="Εφάπαξ σύνδεσμος πρόσκλησης" value={inviteUrl}/>
   <div className="fiscal-actions">
    <button type="button" className="fiscal-button" onClick={()=>navigator.clipboard.writeText(inviteUrl).catch(()=>setError("Αντιγράψτε χειροκίνητα τον σύνδεσμο."))}>Αντιγραφή συνδέσμου</button>
    <button type="button" className="fiscal-button secondary" onClick={()=>{setInviteUrl("");setExpiry("");}}>Κλείσιμο</button>
   </div>
   {expiry?<p className="fiscal-muted">Λήγει: {new Date(expiry).toLocaleString("el-GR")}</p>:null}
  </section>:null}
 </section>;
}
export function FiscalInvitationRevoke({id,csrfToken}:{id:string;csrfToken:string}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function revoke(){
  if(busy||!window.confirm("Οριστική ανάκληση της πρόσκλησης;"))return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/timologio-admin/api/invitations",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action:"revoke",id})
   });
   const result=await response.json() as {revoked?:boolean;error?:string};
   if(!response.ok||!result.revoked)throw Error(result.error??"Η ανάκληση απέτυχε.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Η ανάκληση απέτυχε.");}
  finally{setBusy(false);}
 }
 return <div><button className="fiscal-button secondary" type="button" disabled={busy} onClick={revoke}>{busy?"…":"Ανάκληση"}</button>{error?<small role="alert">{error}</small>:null}</div>;
}

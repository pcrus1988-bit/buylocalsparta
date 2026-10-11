"use client";
import { useState,type FormEvent } from "react";
import styles from "../app/hubs/claim/claim.module.css";
export function HubClaimInquiryForm({id}:{id:string}){
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function send(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setMessage("");
    const form=e.currentTarget;
    const body=new FormData(form);
    try{
      const response=await fetch("/api/hubs/claim/inquiry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        id,name:body.get("name"),email:body.get("email"),message:body.get("message"),consent:body.get("consent")==="on",company:body.get("company")
      })});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error??"Δεν στάλθηκε");
      setMessage("Το μήνυμά σου παραδόθηκε στην επιχείρηση.");form.reset();
    }catch(err){setMessage(err instanceof Error?err.message:"Αποτυχία αποστολής");}
    finally{setBusy(false);}
  }
  return <section className={styles.panel}>
    <h2>Επικοινωνία με την επιχείρηση</h2>
    <p className={styles.hint}>Το μήνυμα παραμένει ιδιωτικό και εμφανίζεται μόνο στον εγκεκριμένο εκπρόσωπο.</p>
    <form onSubmit={send}>
      <div style={{display:"none"}}><label>Company<input name="company" tabIndex={-1} autoComplete="off"/></label></div>
      <label className={styles.field}>Ονοματεπώνυμο<input name="name" required minLength={2} maxLength={100}/></label>
      <label className={styles.field}>Email<input type="email" name="email" required maxLength={160}/></label>
      <label className={styles.field}>Μήνυμα<textarea name="message" required minLength={10} maxLength={1200} rows={4}/></label>
      <label className={styles.field}><span><input name="consent" type="checkbox" required/> Συμφωνώ να κοινοποιηθούν αυτά τα στοιχεία στην επιχείρηση αποκλειστικά για την απάντηση στο αίτημά μου.</span></label>
      <button className={styles.button} type="submit" disabled={busy}>{busy?"Αποστολή…":"Αποστολή μηνύματος"}</button>
      {message&&<p role="status" className={styles.hint}>{message}</p>}
    </form>
  </section>;
}

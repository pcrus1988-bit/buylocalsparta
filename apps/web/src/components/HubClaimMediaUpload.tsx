"use client";
import { useState,type FormEvent } from "react";
import type { HubClaimMedia } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";
export function HubClaimMediaUpload({claimId,csrfToken,items,preview=false}:{claimId:string;csrfToken?:string;items:readonly HubClaimMedia[];preview?:boolean}){
  const [error,setError]=useState(""),[success,setSuccess]=useState(""),[busy,setBusy]=useState(false);
  async function send(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(preview)return;
    setBusy(true);setError("");setSuccess("");
    try{
      const form=new FormData(e.currentTarget);
      form.set("claimId",claimId);
      const file=form.get("file");
      if(!(file instanceof File)||!file.size||file.size>4*1024*1024)throw new Error("Επίλεξε εικόνα έως 4 MB.");
      const response=await fetch("/api/hubs/claim/media",{method:"POST",headers:{"x-csrf-token":csrfToken??""},body:form});
      const json=await response.json() as {error?:string;ok?:boolean};
      if(!response.ok)throw new Error(json.error??"Αποτυχία μεταφόρτωσης");
      setSuccess("Η εικόνα αποθηκεύτηκε ιδιωτικά και περιμένει έλεγχο Admin πριν δημοσιευθεί.");
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Αποτυχία μεταφόρτωσης");}finally{setBusy(false);}
  }
  return <section className={styles.panel}>
    <h2>Εικόνες επιχείρησης</h2>
    <p className={styles.hint}>Λογότυπο, φωτογραφία καταστήματος και έως 4 φωτογραφίες συλλογής. Εμφανίζονται δημόσια μόνο μετά από έλεγχο και έγκριση.</p>
    <div className={styles.mediaGrid}>
      {items.map(item=><div className={styles.mediaTile} key={item.id}>
        {item.status==="approved"&&<img src={"/api/hubs/claim/media/"+item.id} alt={item.altText} loading="lazy"/>}
        <strong>{item.role==="logo"?"Λογότυπο":item.role==="storefront"?"Κατάστημα":"Συλλογή"}</strong>
        <small>{item.status==="approved"?"Δημοσιευμένο":item.status==="pending"?"Σε έλεγχο":"Απορρίφθηκε"} · {item.altText}</small>
      </div>)}
    </div>
    <form onSubmit={send}>
      <fieldset disabled={preview||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <label className={styles.field}>Τύπος φωτογραφίας<select name="role" required defaultValue="logo">
          <option value="logo">Λογότυπο</option><option value="storefront">Φωτογραφία καταστήματος</option><option value="gallery">Συλλογή (έως 4)</option>
        </select></label>
        <label className={styles.field}>Εικόνα έως 4 MB<input type="file" name="file" required accept="image/jpeg,image/png,image/webp"/></label>
        <label className={styles.field}>Περιγραφή εικόνας<input name="altText" required minLength={2} maxLength={240}/></label>
        <label className={styles.field}>Κάτοχος δικαιωμάτων<input name="rightsOwner" required minLength={2} maxLength={200}/></label>
        <button className={styles.button} type="submit" disabled={preview||busy}>{busy?"Μεταφόρτωση…":"Υποβολή για έγκριση"}</button>
      </fieldset>
    </form>
    {error&&<p role="alert" className={styles.hint}>{error}</p>}
    {success&&<p role="status" className={styles.hint}>{success}</p>}
  </section>;
}

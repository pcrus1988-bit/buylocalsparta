"use client";
import { useState } from "react";
import styles from "../app/hubs/claim/claim.module.css";
export function HubClaimWebsiteEmbed({url}:{url:string}){
  const [open,setOpen]=useState(false);
  return <section className={styles.panel}>
    <h2>Ιστοσελίδα επιχείρησης</h2>
    <p className={styles.hint}>Η ιστοσελίδα φιλοξενείται από τρίτο πάροχο. Αν επιλέξεις να την προβάλλεις εδώ, μπορεί να στείλει δεδομένα και cookies στον πάροχο.</p>
    <div className={styles.actions}>
      <button className={styles.button} type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?"Κλείσιμο προβολής":"Προβολή ιστοσελίδας εδώ"}</button>
      <a className={styles.button+" "+styles.secondary} href={url} target="_blank" rel="noopener noreferrer">Άνοιγμα σε νέα καρτέλα ↗</a>
    </div>
    {open&&<><p className={styles.hint}>Αν η ιστοσελίδα δεν εμφανιστεί, ο ιδιοκτήτης της πιθανόν αποκλείει iframe. Χρησιμοποίησε τον σύνδεσμο παραπάνω.</p>
      <iframe className={styles.websiteFrame} src={url} title="Εξωτερική ιστοσελίδα επιχείρησης" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" allow="fullscreen" />
    </>}
  </section>;
}

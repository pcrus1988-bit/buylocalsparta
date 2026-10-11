"use client";

import { useState } from "react";
import styles from "./VendorExternalWebsiteFrame.module.css";

export function VendorExternalWebsiteFrame({ url, vendorName }: { url: string; vendorName: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className={styles.frameShell}>
    <div className={styles.toolbar}>
      <div>
        <strong>Εξωτερική ιστοσελίδα · {vendorName}</strong>
        <span>Το περιεχόμενο και οι αγορές ανήκουν στην ιστοσελίδα της επιχείρησης, όχι στο checkout του ΚΟΝΤΑ ΜΟΥ.</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>Άνοιγμα σε νέα καρτέλα ↗</a>
    </div>
    {loaded ? <iframe
      className={styles.iframe}
      title={`Ιστοσελίδα της επιχείρησης ${vendorName}`}
      src={url}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    /> : <div className={styles.consent}>
      <div className={styles.consentInner}>
        <strong>Προβολή της ιστοσελίδας εδώ</strong>
        <p>Η εξωτερική ιστοσελίδα φορτώνει μόνο αν το επιλέξεις. Μπορεί να χρησιμοποιεί δικά της cookies και να μην επιτρέπει την εμφάνιση μέσα σε άλλη σελίδα.</p>
        <button type="button" className="button" onClick={() => setLoaded(true)}>Προβολή ιστοσελίδας</button>
      </div>
    </div>}
    {loaded && <p className={styles.fallback}>Δεν εμφανίζεται η ιστοσελίδα; Μερικά καταστήματα απαγορεύουν την ενσωμάτωση. <a href={url} target="_blank" rel="noopener noreferrer">Άνοιξέ την σε νέα καρτέλα ↗</a></p>}
  </div>;
}

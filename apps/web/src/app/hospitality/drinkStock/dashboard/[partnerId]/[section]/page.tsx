import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../../../hospitality.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock Partner Module",robots:{index:false,follow:false}};
const moduleNames:Record<string,{title:string;description:string}>={
  live:{title:"Ζωντανές τιμές",description:"Ο έλεγχος ενεργής τιμολόγησης θα γίνεται αποκλειστικά για χώρους αυτού του συνεργάτη."},
  screen:{title:"Οθόνες",description:"Οι οθόνες θα αντιστοιχίζονται ρητά σε χώρο και συνεργάτη, με κλειδί προβολής που ανακαλείται."},
  guest:{title:"Εμπειρία επισκέπτη",description:"Τα QR θα συνδέονται με έναν και μόνο χώρο και θα δημοσιεύονται με επιμέρους εξουσιοδότηση."},
  settings:{title:"Ρυθμίσεις",description:"Δικαιώματα ομάδας, ελεγχόμενα όρια τιμών και δυνατότητα παύσης ανά χώρο."},
  reports:{title:"Αναφορές",description:"Επιχειρησιακά στοιχεία μόνο από εγκεκριμένους χώρους του συγκεκριμένου συνεργάτη."}
};
export default async function DrinkStockPartnerModule({params}:{params:Promise<{partnerId:string;section:string}>}) {
  const {section}=await params;
  const entry=Object.prototype.hasOwnProperty.call(moduleNames,section)?moduleNames[section]:undefined;
  if(!entry)notFound();
  // Parent layout resolves the authenticated member and exact partner ID.
  return <main className={styles.main}><section className={styles.authPane}>
    <span className={styles.eyebrow}>DRINKSTOCK / PARTNER MODULE</span>
    <h1>{entry.title}</h1>
    <p>{entry.description}</p>
    <p className={styles.helpCopy}>Η ενότητα προετοιμάζεται. Δεν χρησιμοποιούνται πραγματικά δεδομένα συναλλαγών ή τιμολόγησης.</p>
  </section></main>;
}
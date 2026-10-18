import type { Metadata } from "next";
import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { hospitalityIdentity,accessibleDrinkStockPartners,drinkStockPartnerVenues } from "../../../../../../lib/hospitality-partner-access";
import styles from "../../../../hospitality.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock Partner Module",robots:{index:false,follow:false}};
const moduleNames:Record<string,{title:string;description:string}>={
 live:{title:"Ζωντανές τιμές",description:"Διάλεξε χώρο για να διαχειριστείς τον ατομικό κατάλογο, τις εικονικές μεταβολές και τον πίνακα τιμών."},
 screen:{title:"Οθόνες",description:"Μπορείς ήδη να δοκιμάσεις την πλήρη προβολή μέσα από το Trading Floor κάθε ενεργού χώρου. Οι ανεξάρτητες δημόσιες οθόνες θα ενεργοποιηθούν με ανακλητά κλειδιά."},
 guest:{title:"Εμπειρία επισκέπτη",description:"Τα QR θα συνδέονται με έναν και μόνο χώρο και θα δημοσιεύονται με επιμέρους εξουσιοδότηση."},
 settings:{title:"Ρυθμίσεις",description:"Τα όρια προσομοίωσης (70–145%) είναι ενιαία και ασφαλή. Κάθε χώρος εκκινεί σε παύση και ενεργοποιείται μόνο από owner ή manager."},
 reports:{title:"Αναφορές",description:"Κάθε venue διαθέτει ήδη ιστορικό κινήσεων rehearsal μέσα στο Trading Floor. Εμπορικές αναφορές POS δεν υπάρχουν ακόμη."}
};
export default async function DrinkStockPartnerModule({params}:{params:Promise<{partnerId:string;section:string}>}) {
 const {partnerId,section}=await params;
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkStock/login");
 const entry=Object.prototype.hasOwnProperty.call(moduleNames,section)?moduleNames[section]:undefined;
 if(!entry)notFound();
 const partner=(await accessibleDrinkStockPartners(principal.userId)).find(p=>p.partnerId===partnerId);
 if(!partner)notFound();
 const venues=await drinkStockPartnerVenues(principal.userId,partnerId);
 return <main className={styles.main}><section className={styles.authPane} style={{maxWidth:850}}>
   <span className={styles.eyebrow}>DRINKSTOCK / {partner.partnerName}</span>
   <h1 style={{fontSize:49}}>{entry.title}</h1>
   <p>{entry.description}</p>
   {(section==="live"||section==="screen"||section==="reports")&&
   <div className={styles.partnerGrid} style={{gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))"}}>
   {venues.filter(v=>v.status==="active").map(venue=>
     <Link className={styles.partnerCard} key={venue.venueId}
       href={`/drinkStock/dashboard/${partnerId}/venues/${venue.venueId}`}>
       <strong>{venue.name}</strong><small>Open private Trading Floor ↗</small>
     </Link>)}
   </div>}
   <p className={styles.helpCopy}>Δεν εκτελούνται πραγματικές παραγγελίες, τιμολογήσεις ή πληρωμές.</p>
 </section></main>;
}

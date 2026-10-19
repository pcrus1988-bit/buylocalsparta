import type { Metadata } from "next";
import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { hospitalityIdentity,accessibleDrinkStockPartners,drinkStockPartnerVenues } from "../../../../../../lib/hospitality-partner-access";
import styles from "../../../../hospitality.module.css";
import {drinkStockPartnerReport} from "../../../../../../lib/drinkstock-reports-service";
import {DrinkStockReportsDashboard} from "../../../../../../components/DrinkStockReportsDashboard";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock Partner Module",robots:{index:false,follow:false}};
const moduleNames:Record<string,{title:string;description:string}>={
 live:{title:"Ζωντανές τιμές",description:"Διάλεξε χώρο για να διαχειριστείς τον ατομικό κατάλογο, τις εικονικές μεταβολές και τον πίνακα τιμών."},
 screen:{title:"Οθόνες",description:"Μπορείς ήδη να δοκιμάσεις την πλήρη προβολή μέσα από το Trading Floor κάθε ενεργού χώρου. Οι ανεξάρτητες δημόσιες οθόνες θα ενεργοποιηθούν με ανακλητά κλειδιά."},
 guest:{title:"Εμπειρία επισκέπτη",description:"Τα QR θα συνδέονται με έναν και μόνο χώρο και θα δημοσιεύονται με επιμέρους εξουσιοδότηση."},
 settings:{title:"Ρυθμίσεις",description:"Τα όρια προσομοίωσης (70–145%) είναι ενιαία και ασφαλή. Κάθε χώρος εκκινεί σε παύση και ενεργοποιείται μόνο από owner ή manager."},
 reports:{title:"Αναφορές",description:"Πραγματικά δεδομένα συναλλαγών από επαληθευμένα συμβάντα πληρωμών, χωρίς προσμίξεις demo."}
};
export default async function DrinkStockPartnerModule({params,searchParams}:{params:Promise<{partnerId:string;section:string}>;searchParams:Promise<{days?:string}>}) {
 const {partnerId,section}=await params;
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkStock/login");
 const entry=Object.prototype.hasOwnProperty.call(moduleNames,section)?moduleNames[section]:undefined;
 if(!entry)notFound();
 const partner=(await accessibleDrinkStockPartners(principal.userId)).find(p=>p.partnerId===partnerId);
 if(!partner)notFound();
 if(section==="reports"){
  if(!["owner","manager"].includes(partner.role))notFound();
  try{
   const {days}=await searchParams;
   const report=await drinkStockPartnerReport(principal.userId,partnerId,days);
   return <main style={{minHeight:"100vh",background:"linear-gradient(145deg,#0f152b,#21143a)"}}><DrinkStockReportsDashboard report={report}/></main>;
  }catch(error){
   if(error&&typeof error==="object"&&"digest" in error)throw error;
   return <main className={styles.main}><section className={styles.authPane}><h1>Trading reports unavailable</h1>
    <p>Report data could not be verified right now. No sample revenue or invented orders are displayed.</p>
    <Link href={`/drinkstock/dashboard/${partnerId}`}>← Return to partner dashboard</Link>
   </section></main>;
  }
 }
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

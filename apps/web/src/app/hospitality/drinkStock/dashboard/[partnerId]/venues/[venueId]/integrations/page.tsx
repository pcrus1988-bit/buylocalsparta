import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {managerSessionView,SessionError} from "../../../../../../../../lib/drinkstock-session-service";
import {posProviderCatalogue} from "../../../../../../../../lib/drinkstock-pos-providers";
import {DrinkStockPosWizard} from "../../../../../../../../components/DrinkStockPosWizard";
import styles from "../../../../../../hospitality.module.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"DrinkStock · POS Integrations",robots:{index:false,follow:false}
};

/** Every venue view is checked against verified partner membership on server. */
export default async function VenuePosIntegrations({params}:{
 params:Promise<{partnerId:string;venueId:string}>
}){
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkstock/login");
 const {partnerId,venueId}=await params;
 let view;
 try{view=await managerSessionView(principal.userId,partnerId,venueId);}
 catch(error){
  if(error instanceof SessionError&&error.status===404)notFound();
  return <main className={styles.main}><section className={styles.authPane}>
   <h1>Οι διασυνδέσεις POS δεν είναι διαθέσιμες.</h1>
   <p>Δεν είναι δυνατή η επαλήθευση πρόσβασης σε αυτόν τον χώρο.</p>
  </section></main>;
 }
 const canManage=["owner","manager"].includes(view.venue.role??"");
 const providers=posProviderCatalogue();
 return <main className={styles.main}>
  <section className={styles.dashboardHeader}>
   <Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}`}>← Trading Floor</Link>
   <span className={styles.eyebrow}>DRINKSTOCK / VENUE INTEGRATIONS</span>
   <h1>POS Integrations</h1>
   <p>{view.venue.name} · Εύκολη προετοιμασία σύνδεσης με ελληνικά συστήματα παραγγελιοληψίας.</p>
  </section>
  {canManage?<DrinkStockPosWizard venueName={view.venue.name} partnerId={partnerId} venueId={venueId} csrfToken={principal.csrfToken} providers={providers} drinks={view.products.map(p=>({id:p.id,name:p.name}))}/>:
   <section className={styles.authPane}>
    <h2>Η προετοιμασία σύνδεσης είναι διαθέσιμη σε owner/manager.</h2>
    <p>Δεν απαιτείται τεχνική εμπειρία. Ζητήστε από τον υπεύθυνο του χώρου να ανοίξει τον οδηγό σύνδεσης.</p>
   </section>}
  <section className={styles.authPane} aria-label="POS integration availability">
   <h2>Υποστήριξη ελληνικών POS</h2>
   <p>Η επιλογή ενός συστήματος στον οδηγό είναι προετοιμασία και όχι πιστοποιημένη σύνδεση. Κανένας πάροχος δεν ενεργοποιείται χωρίς επίσημη τεχνική πρόσβαση και έλεγχο πληρωμών/φορολογικών παραστατικών.</p>
   <p>Τα υπάρχοντα POS, ταμειακή/ΑΑΔΕ και τερματικά πληρωμών παραμένουν ανεπηρέαστα.</p>
  </section>
 </main>;
}

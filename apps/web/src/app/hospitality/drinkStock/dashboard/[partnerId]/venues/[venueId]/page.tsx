import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../lib/hospitality-partner-access";
import {drinkStockMarketSnapshot,DrinkStockMarketError} from "../../../../../../../lib/drinkstock-market-service";
import {managerSessionView} from "../../../../../../../lib/drinkstock-session-service";
import {DrinkStockSessionControl} from "../../../../../../../components/DrinkStockSessionControl";
import {DrinkStockVenueMarket} from "../../../../../../../components/DrinkStockVenueMarket";
import styles from "../../../../../hospitality.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock Trading Floor · Venue",robots:{index:false,follow:false}};
export default async function VenueMarketPage({params}:{params:Promise<{partnerId:string;venueId:string}>}){
  const session=await hospitalityIdentity();
  if(!session)redirect("/drinkStock/login");
  const {partnerId,venueId}=await params;
  let data; let operations;
  try{[data,operations]=await Promise.all([drinkStockMarketSnapshot(session.userId,partnerId,venueId),managerSessionView(session.userId,partnerId,venueId)]);}
  catch(error){
    if(error instanceof DrinkStockMarketError&&error.status===404)notFound();
    return <main className={styles.main}><section className={styles.authPane}>
      <h1>Trading floor unavailable.</h1>
      <p>Η φόρτωση της αγοράς δοκιμών δεν είναι διαθέσιμη. Η πρόσβαση και τα δεδομένα δεν αντικαθίστανται με δεδομένα άλλου συνεργάτη.</p>
    </section></main>;
  }
  return <div className={styles.main}>
    <p style={{paddingTop:25,fontSize:13}}><Link href={`/drinkStock/dashboard/${partnerId}`}>← Οι χώροι μου</Link></p>
    <DrinkStockSessionControl initial={operations} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
    <DrinkStockVenueMarket initial={data} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
  </div>;
}

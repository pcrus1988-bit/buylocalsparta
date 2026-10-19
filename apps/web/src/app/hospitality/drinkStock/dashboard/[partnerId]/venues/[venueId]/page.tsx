import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../lib/hospitality-partner-access";
import {drinkStockMarketSnapshot,DrinkStockMarketError} from "../../../../../../../lib/drinkstock-market-service";
import {managerSessionView} from "../../../../../../../lib/drinkstock-session-service";
import {DrinkStockSessionControl} from "../../../../../../../components/DrinkStockSessionControl";
import {DrinkStockStaffQueue} from "../../../../../../../components/DrinkStockStaffQueue";
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
    {["owner","manager"].includes(operations.venue.role??"")&&<div style={{maxWidth:1280,margin:"8px auto",textAlign:"right"}}>
     <Link href={`/drinkstock/dashboard/${partnerId}/reports`} style={{display:"inline-block",padding:"11px 15px",borderRadius:12,background:"#d9ff57",color:"#172022",fontWeight:850,textDecoration:"none"}}>📊 Trading reports ↗</Link>
    </div>}
    {["owner","manager"].includes(operations.venue.role??"")&&<p><Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}/integrations`} style={{display:"inline-flex",padding:"10px 18px",border:"1px solid #9fc0d9",borderRadius:12,marginBottom:12,color:"#d9ff57",background:"#182239",textDecoration:"none"}}>🔌 POS Easy Connect ↗</Link></p>}
    <DrinkStockSessionControl initial={operations} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
    {["owner","manager","staff"].includes(operations.venue.role??"")&&<DrinkStockStaffQueue partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>}
    <DrinkStockVenueMarket initial={data} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
  </div>;
}

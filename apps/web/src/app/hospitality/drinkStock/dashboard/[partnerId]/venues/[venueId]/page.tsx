import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../lib/hospitality-partner-access";
import {drinkStockMarketSnapshot,DrinkStockMarketError} from "../../../../../../../lib/drinkstock-market-service";
import {managerSessionView} from "../../../../../../../lib/drinkstock-session-service";
import {DrinkStockSessionControl} from "../../../../../../../components/DrinkStockSessionControl";
import {DrinkStockStaffQueue} from "../../../../../../../components/DrinkStockStaffQueue";
import {DrinkStockStationStaffManager} from "../../../../../../../components/DrinkStockStationStaffManager";
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
  // Staff never receive manager-only market controls. Their partner workspace
  // displays direct links solely to the stations assigned to this venue.
  if(operations.venue.role==="staff")redirect(`/drinkstock/dashboard/${partnerId}`);
  return <div className={styles.main}>
    <p style={{paddingTop:25,fontSize:13}}><Link href={`/drinkStock/dashboard/${partnerId}`}>← Οι χώροι μου</Link></p>
    {["owner","manager"].includes(operations.venue.role??"")&&<div style={{maxWidth:1280,margin:"8px auto",textAlign:"right"}}>
     <Link href={`/drinkstock/dashboard/${partnerId}/reports`} style={{display:"inline-block",padding:"11px 15px",borderRadius:12,background:"#d9ff57",color:"#172022",fontWeight:850,textDecoration:"none"}}>📊 Trading reports ↗</Link>
    </div>}
    {["owner","manager"].includes(operations.venue.role??"")&&<p><Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}/checkout`}
      style={{display:"inline-flex",padding:"10px 18px",border:"1px solid #ffc888",borderRadius:12,marginBottom:12,marginRight:12,color:"#ffe9b4",background:"#32251f",textDecoration:"none"}}>
       💳 Checkout activation checks ↗
     </Link></p>}
    {["owner","manager"].includes(operations.venue.role??"")&&<p><Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}/integrations`} style={{display:"inline-flex",padding:"10px 18px",border:"1px solid #9fc0d9",borderRadius:12,marginBottom:12,color:"#d9ff57",background:"#182239",textDecoration:"none"}}>🔌 POS Easy Connect ↗</Link></p>}
    {["owner","manager","staff"].includes(operations.venue.role??"")&&<nav
      aria-label="Bar and waiter operations" style={{maxWidth:1280,margin:"12px auto",display:"flex",gap:12,flexWrap:"wrap"}}>
      <Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}/bar`}
       style={{background:"#d9ff57",color:"#142132",borderRadius:12,padding:"12px 18px",fontWeight:900,textDecoration:"none"}}>🍸 BAR / LIVE ORDERS ↗</Link>
      <Link href={`/drinkstock/dashboard/${partnerId}/venues/${venueId}/waiters`}
       style={{background:"#f5c7ff",color:"#142132",borderRadius:12,padding:"12px 18px",fontWeight:900,textDecoration:"none"}}>🛎 WAITERS / DELIVERY ↗</Link>
     </nav>}
    {["owner","manager"].includes(operations.venue.role??"")&&<DrinkStockStationStaffManager
     partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>}
    <DrinkStockSessionControl initial={operations} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
    {["owner","manager"].includes(operations.venue.role??"")&&<DrinkStockStaffQueue partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>}

    <DrinkStockVenueMarket initial={data} partnerId={partnerId} venueId={venueId} csrfToken={session.csrfToken}/>
  </div>;
}

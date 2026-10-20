import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../../lib/hospitality-partner-access";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "../../../../../../../../lib/postgres-runtime";
import {requireStationAccess} from "../../../../../../../../lib/drinkstock-station-access-service";
import {DrinkStockStationBoard} from "../../../../../../../../components/DrinkStockStationBoard";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · Bar Preparation",robots:{index:false,follow:false}};
export default async function BarBoardPage({
 params
}:{params:Promise<{partnerId:string;venueId:string}>}){
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkstock/login");
 const {partnerId,venueId}=await params;
 if(!productionDatabaseConfigured())return <main style={{padding:26}}>Station board unavailable: no database connection.</main>;
 try{
  await requireStationAccess(getProductionPostgresRuntime().sqlPool,principal.userId,partnerId,venueId,"bar");
 }catch{return notFound();}
 const back=`/drinkstock/dashboard/${partnerId}/venues/${venueId}`;
 return <main style={{minHeight:"100vh",padding:"18px clamp(14px,3vw,35px)",background:"#0d0a1e",color:"#fff"}}>
  <nav style={{maxWidth:1340,margin:"0 auto",display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:12}}>
   <Link href={back} style={{color:"#caff4e"}}>← Venue dashboard</Link>
   <div style={{display:"flex",gap:15}}>
    <Link href={back+"/bar"} style={{color:"#fff"}}>🍸 Bar</Link>
    <Link href={back+"/waiters"} style={{color:"#fff"}}>🛎 Waiters</Link>
   </div>
  </nav>
  <DrinkStockStationBoard station="bar" partnerId={partnerId} venueId={venueId} csrfToken={principal.csrfToken}/>
 </main>;
}
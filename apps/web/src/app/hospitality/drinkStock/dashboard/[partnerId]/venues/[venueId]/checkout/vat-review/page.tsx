import type {Metadata} from "next";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {hospitalityIdentity} from "../../../../../../../../../lib/hospitality-partner-access";
import {drinkStockMarketSnapshot,DrinkStockMarketError} from "../../../../../../../../../lib/drinkstock-market-service";
import {DrinkStockVatReviewPanel} from "../../../../../../../../../components/DrinkStockVatReviewPanel";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DrinkStock · Beverage VAT review",robots:{index:false,follow:false}};
export default async function VenueVatReviewPage({params}:{params:Promise<{partnerId:string;venueId:string}>}){
 const principal=await hospitalityIdentity();
 if(!principal)redirect("/drinkStock/login");
 const {partnerId,venueId}=await params;
 let market;
 try{market=await drinkStockMarketSnapshot(principal.userId,partnerId,venueId);}
 catch(error){
  if(error instanceof DrinkStockMarketError&&error.status===404)notFound();
  return <main><h1>VAT review unavailable</h1><p>Could not verify venue permissions. Nothing has been changed.</p></main>;
 }
 if(market.venue.role!=="owner")notFound();
 return <main style={{background:"#0e1a30",color:"#f4f5ff",minHeight:"100vh",padding:"30px 16px"}}>
  <section style={{maxWidth:980,margin:"0 auto"}}>
   <Link href={`/drinkStock/dashboard/${partnerId}/venues/${venueId}/checkout`} style={{color:"#d9ff57"}}>← Checkout activation</Link>
   <h1>Review the drinks' VAT classification</h1>
   <p>These product classifications are recorded under the venue owner's authority and audited.
    The applicable rate still depends on the service mode and the venue's verified jurisdiction.
    This form cannot take payments or issue receipts.</p>
   <DrinkStockVatReviewPanel products={market.products} partnerId={partnerId} venueId={venueId}
    csrfToken={principal.csrfToken} sessionActive={market.venue.activeSession}/>
  </section>
 </main>;
}

import {notFound} from "next/navigation";
import {publicSessionView,SessionError} from "../../../../../lib/drinkstock-session-service";
import {DrinkStockScreenClient} from "../../../../../components/DrinkStockScreenClient";
export const dynamic="force-dynamic";
export const metadata={title:"DrinkStock · Venue Live Market",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Screen({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 try{return <div data-drinkstock-standalone><DrinkStockScreenClient token={token} initial={await publicSessionView(token,"screen")}/></div>;}
 catch(error){if(error instanceof SessionError&&error.status===404)notFound();
 return <main data-drinkstock-standalone style={{minHeight:"100vh",padding:"clamp(28px,5vw,60px)",background:"#0d0a1e",color:"#fff"}}><h1>Trading board unavailable</h1><p>Try again when this venue is connected.</p></main>;}
}

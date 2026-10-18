import {notFound} from "next/navigation";
import {publicSessionView,SessionError} from "../../../../../lib/drinkstock-session-service";
import {DrinkStockGuestCart} from "../../../../../components/DrinkStockGuestCart";
export const dynamic="force-dynamic";
export const metadata={title:"DrinkStock · Table Trading Board",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function TableMenu({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 try{
  const view=await publicSessionView(token,"table");
  return <DrinkStockGuestCart token={token} initial={view}/>;
 }catch(error){
  if(error instanceof SessionError&&error.status===404)notFound();
  return <main role="alert" style={{minHeight:"100vh",padding:"clamp(26px,5vw,55px)",background:"#14102b",color:"#fff",fontFamily:"Arial,sans-serif"}}>
   <h1>Table trading board unavailable</h1>
   <p>DrinkStock cannot verify this venue's session. No order or payment was created. Ask the venue staff for assistance.</p>
  </main>;
 }
}

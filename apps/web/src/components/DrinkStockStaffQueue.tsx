"use client";
import {useEffect,useState} from "react";
import type {StaffOrder} from "../lib/drinkstock-fulfilment-service";

type QueueResponse={role:string;orders:StaffOrder[];error?:string};
type NextState="accepted"|"preparing"|"ready"|"served";
const next:Partial<Record<StaffOrder["state"],NextState>>={
 paid:"accepted",accepted:"preparing",preparing:"ready",ready:"served"
};
const labels:Record<NextState,string>={
 accepted:"✓ Accept",preparing:"🍹 Start preparing",ready:"✓ Mark ready",served:"✓ Mark served"
};
const euro=(c:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(c/100);
const style:React.CSSProperties={padding:"12px 18px",fontWeight:800,borderRadius:12,border:0,color:"#100c23",background:"#caff4e",cursor:"pointer"};

export function DrinkStockStaffQueue({partnerId,venueId,csrfToken}:{
 partnerId:string;venueId:string;csrfToken:string
}){
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/orders`;
 const [orders,setOrders]=useState<StaffOrder[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  let mounted=true;
  async function refresh(){
   try{
    const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    const payload=await response.json() as QueueResponse;
    if(!response.ok)throw new Error(payload.error??"QUEUE_UNAVAILABLE");
    if(mounted){setOrders(payload.orders);setError("");}
   }catch(cause){
    if(mounted)setError(cause instanceof Error?cause.message:"QUEUE_UNAVAILABLE");
   }finally{if(mounted)setLoading(false);}
  }
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},8000);
  return ()=>{mounted=false;window.clearInterval(timer);};
 },[endpoint]);
 async function advance(order:StaffOrder,target:NextState){
  if(busy||next[order.state]!==target||order.paymentState!=="paid")return;
  if(target==="served"&&(order.fiscalState!=="issued"||!order.receiptIssued))return;
  setBusy(order.id);setError("");
  try{
   const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({orderId:order.id,next:target,requestKey:crypto.randomUUID()})});
   const payload=await response.json() as {error?:string};
   if(!response.ok)throw new Error(payload.error??"UPDATE_NOT_CONFIRMED");
   const refreshed=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
   if(!refreshed.ok)throw new Error("QUEUE_REFRESH_FAILED");
   const current=await refreshed.json() as QueueResponse;
   setOrders(current.orders);
  }catch(cause){setError(cause instanceof Error?cause.message:"UPDATE_NOT_CONFIRMED");}
  finally{setBusy(null);}
 }
 const pending=orders.filter(o=>["paid","accepted","preparing","ready"].includes(o.state)).length;
 return <section aria-label="DrinkStock order fulfilment" style={{
  maxWidth:1280,margin:"24px auto",padding:"clamp(18px,3vw,28px)",color:"#fff",
  background:"linear-gradient(130deg,#15112e,#1d1434)",
  border:"1px solid #6c5774",borderRadius:24
 }}>
  <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <div><p style={{fontSize:11,letterSpacing:3,color:"#caff4e",fontWeight:900}}>STAFF / FULFILMENT</p>
    <h2 style={{fontSize:"clamp(24px,4vw,36px)",margin:"6px 0"}}>Drink order queue</h2>
    <p style={{fontSize:13,color:"#c6bad6",lineHeight:1.6}}>Only provider-confirmed paid orders appear here. No demo orders or invented sales.</p>
   </div>
   <div role="status" style={{padding:"12px 16px",border:"1px solid #ffffff32",borderRadius:14}}>
    <strong style={{fontSize:26,color:"#caff4e"}}>{pending}</strong> <span>open orders</span>
   </div>
  </header>
  {error&&<p role="alert" style={{padding:12,background:"#60202c",borderRadius:12}}>Order queue unavailable: {error}</p>}
  {loading?<p role="status">Loading venue orders…</p>:
   !orders.length?<p style={{padding:"22px 0",color:"#d3c8e0"}}>No confirmed paid orders for this venue. Customer checkout and fiscal issuance are not activated.</p>:
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,290px),1fr))",gap:14,marginTop:18}}>
    {orders.map(order=>{
     const target=next[order.state];
     const fiscalRequired=target==="served"&&(order.fiscalState!=="issued"||!order.receiptIssued);
     const enabled=Boolean(target)&&order.paymentState==="paid"&&!fiscalRequired&&!busy;
     return <article key={order.id} style={{padding:17,borderRadius:16,background:"#ffffff10",border:"1px solid #ffffff24"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
       <strong>▦ Table {order.tableLabel??"—"}</strong><strong style={{color:"#caff4e"}}>{euro(order.amountGrossCents)}</strong>
      </div>
      <p style={{fontSize:12,color:"#b9b2d0"}}>{new Date(order.createdAt).toLocaleString("el-GR")} · {order.id.slice(0,8)}</p>
      <strong style={{display:"block",margin:"12px 0",textTransform:"uppercase"}}>{order.state.replaceAll("_"," ")}</strong>
      <ul style={{paddingLeft:20,marginBottom:18}}>
       {order.lines.map(line=><li key={line.id} style={{marginBottom:7}}>
        {line.quantity} × {line.description} <small style={{color:"#cbbce5"}}>({euro(line.grossCents)})</small>
       </li>)}
      </ul>
      {target&&<button type="button" style={{...style,opacity:enabled?1:.45}}
       disabled={!enabled} onClick={()=>void advance(order,target)}>{busy===order.id?"Saving…":labels[target]}</button>}
      {fiscalRequired&&<p role="status" style={{fontSize:12,color:"#ffa0a7"}}>Service blocked until a verifiable fiscal receipt with provider reference has been issued.</p>}
      {order.paymentState!=="paid"&&<p style={{fontSize:12,color:"#ffa0a7"}}>Payment not in paid state — fulfilment locked.</p>}
     </article>;
    })}
   </div>}
 </section>;
}

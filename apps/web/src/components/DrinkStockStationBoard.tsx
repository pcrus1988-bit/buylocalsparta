"use client";
import {useEffect,useMemo,useState} from "react";
import type {StaffOrder} from "../lib/drinkstock-fulfilment-service";
import {STATION_TRANSITIONS,type DrinkStockStation} from "../lib/drinkstock-station-policy";

type Feed={role:string;orders:StaffOrder[];error?:string};
type OrderFilter="action"|"open"|"all";
const euro=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n/100);
const time=(s:string)=>new Date(s).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit"});
const labels:Record<string,string>={
 paid:"NEW PAID ORDER",accepted:"ACCEPTED",preparing:"PREPARING",
 ready:"READY FOR DELIVERY",served:"SERVED",cancelled:"CANCELLED",refunded:"REFUNDED"
};
const nextLabels:Record<string,string>={
 accepted:"✓ ACCEPT TICKET",preparing:"🍸 START PREPARING",
 ready:"🔔 DRINKS ARE READY",served:"✓ DELIVERED TO TABLE"
};
const liveStates=["paid","accepted","preparing","ready"];
function actionable(order:StaffOrder,station:DrinkStockStation){
 const dest=STATION_TRANSITIONS[station][order.state];
 return Boolean(dest&&order.paymentState==="paid"&&(dest!=="served"||(order.receiptIssued&&order.fiscalState==="issued")));
}
export function DrinkStockStationBoard({partnerId,venueId,csrfToken,station}:{
 partnerId:string;venueId:string;csrfToken:string;station:DrinkStockStation
}){
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/orders/station/${station}`;
 const [feed,setFeed]=useState<Feed|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [offline,setOffline]=useState(false);
 const [filter,setFilter]=useState<OrderFilter>("open");
 const [updated,setUpdated]=useState<number|null>(null);
 const [tick,setTick]=useState(Date.now());
 useEffect(()=>{
  let mounted=true;
  async function refresh(){
   try{
    const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    const result=await response.json() as Feed;
    if(!response.ok)throw new Error(result.error??"QUEUE_UNAVAILABLE");
    if(mounted){setFeed(result);setOffline(false);setUpdated(Date.now());setError("");}
   }catch(e){if(mounted){setOffline(true);setError(e instanceof Error?e.message:"QUEUE_UNAVAILABLE");}}
  }
  void refresh();
  const polling=window.setInterval(()=>{if(document.visibilityState==="visible"&&!busy)void refresh();},5000);
  const clock=window.setInterval(()=>setTick(Date.now()),1000);
  return ()=>{mounted=false;window.clearInterval(polling);window.clearInterval(clock);};
 },[endpoint,busy]);
 async function advance(order:StaffOrder){
  const target=STATION_TRANSITIONS[station][order.state];
  if(!target||busy||offline||!actionable(order,station))return;
  if(target==="served"&&!window.confirm(`Confirm that order ${order.id.slice(0,8)} has been delivered to table ${order.tableLabel??"—"}?`))return;
  setBusy(order.id);setError("");
  const key=crypto.randomUUID();
  try{
   const resp=await fetch(endpoint,{method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({orderId:order.id,next:target,requestKey:key})});
   const res=await resp.json() as {error?:string};
   if(!resp.ok)throw new Error(res.error??"UPDATE_NOT_CONFIRMED");
   const refreshed=await fetch(endpoint,{cache:"no-store",credentials:"same-origin"});
   if(!refreshed.ok)throw new Error("REFRESH_UNAVAILABLE");
   const data=await refreshed.json() as Feed;
   setFeed(data);setUpdated(Date.now());setOffline(false);
  }catch(e){
   setError(e instanceof Error?e.message:"UPDATE_NOT_CONFIRMED");
   // Never optimistically mark drinks ready/served when DB persistence is unknown.
  }finally{setBusy(null);}
 }
 const all=feed?.orders??[];
 const ready=all.filter(o=>o.state==="ready"&&o.paymentState==="paid").length;
 const inProgress=all.filter(o=>["paid","accepted","preparing"].includes(o.state)&&o.paymentState==="paid").length;
 const actionableOrders=useMemo(()=>all.filter(o=>actionable(o,station)),[all,station]);
 const ordered=all.filter(o=>filter==="all"||filter==="open"?
  (filter==="all"||liveStates.includes(o.state)):actionable(o,station))
  .sort((a,b)=>{
   const actionDelta=Number(actionable(b,station))-Number(actionable(a,station));
   if(actionDelta)return actionDelta;
   return Date.parse(a.createdAt)-Date.parse(b.createdAt);
  });
 const isBar=station==="bar";
 const heading=isBar?"🍸 BAR / PREPARATION":"🛎 WAITERS / FLOOR SERVICE";
 return <section aria-label={isBar?"Bar order preparation board":"Waiter delivery board"}
   style={{maxWidth:1340,margin:"22px auto",borderRadius:22,padding:"clamp(18px,3vw,28px)",
    color:"#fff",background:"linear-gradient(135deg,#15112e,#1d122f)",border:"1px solid #665585"}}>
  <header style={{display:"flex",justifyContent:"space-between",gap:20,flexWrap:"wrap",alignItems:"center"}}>
   <div>
    <p style={{fontSize:11,letterSpacing:2.7,color:"#caff4e",fontWeight:900}}>DRINKSTOCK / STAFF STATION</p>
    <h1 style={{fontSize:"clamp(28px,5vw,45px)",margin:"4px 0 10px"}}>{heading}</h1>
    <p style={{margin:0,color:"#bfc4d6",fontSize:13,lineHeight:1.6}}>
     {isBar?"New paid orders → accepted → preparing → ready. Mark ready when every drink in the ticket has been prepared.":
     "See table numbers and drink details. Deliver only orders marked ready and accompanied by a verified fiscal receipt."}
    </p>
   </div>
   <strong role="status" style={{color:offline?"#ffadad":"#aaf7b8",fontSize:13}}>
    {offline?"● DISCONNECTED — ACTIONS BLOCKED":"● CONNECTED · AUTO-REFRESH 5s"}
   </strong>
  </header>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:12,margin:"20px 0"}}>
   {[{name:"NEEDS ACTION",value:actionableOrders.length},
     {name:isBar?"PREPARATION QUEUE":"COMING FROM BAR",value:inProgress},
     {name:"READY / WAITING",value:ready}].map(x=><div key={x.name}
      style={{padding:17,borderRadius:13,border:"1px solid #ffffff2e",background:"#ffffff0b"}}>
      <small style={{letterSpacing:1.1,color:"#b7bed0"}}>{x.name}</small>
      <div style={{fontWeight:900,fontSize:36,color:"#caff4e"}}>{x.value}</div>
    </div>)}
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
   <div role="group" aria-label="Filter orders" style={{display:"flex",gap:8}}>
    {([["action","Needs action"],["open","Open"],["all","Recent"]] as const).map(([key,name])=>
     <button key={key} type="button" onClick={()=>setFilter(key)}
      aria-pressed={filter===key} style={{border:filter===key?"1px solid #caff4e":"1px solid #8992ac",
       borderRadius:10,padding:"9px 12px",fontWeight:800,color:filter===key?"#100c23":"#fff",
       background:filter===key?"#caff4e":"#ffffff17"}}>{name}</button>)}
   </div>
   <small style={{color:"#a6b0c4"}}>{updated?"Last synced "+new Date(updated).toLocaleTimeString("el-GR"):"Connecting…"}</small>
  </div>
  {error&&<div role="alert" style={{padding:14,border:"1px solid #fd8d8d",background:"#522133",borderRadius:11,marginBottom:12}}>
   Queue status: {error}. Do not repeat an unconfirmed update without checking the ticket.
  </div>}
  {!feed?<p role="status" style={{padding:24}}>Checking authenticated venue orders…</p>:
   !ordered.length?<div style={{padding:30,textAlign:"center",borderRadius:14,border:"1px dashed #8b91a2"}}>
    <strong style={{fontSize:22}}>No {filter==="action"?"actionable":filter==="open"?"open":"recent"} verified orders</strong>
    <p style={{color:"#b4b6c4"}}>Only orders with matching provider payment evidence enter this live board.
     The KONTA MOY fallback checkout cannot accept payments until its PSP and fiscal adapter are operational.</p>
   </div>:
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,310px),1fr))",gap:13}}>
    {ordered.map(o=>{
     const target=STATION_TRANSITIONS[station][o.state];
     const canAct=!offline&&!busy&&actionable(o,station);
     const receiptBlock=station==="waiter"&&o.state==="ready"&&(!o.receiptIssued||o.fiscalState!=="issued");
     const minutes=Math.max(0,Math.floor((tick-Date.parse(o.createdAt))/60000));
     return <article key={o.id} style={{background:o.state==="ready"?"#153d3d":"#211936",
      border:o.state==="ready"?"2px solid #caff4e":"1px solid #556480",borderRadius:15,padding:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
       <strong style={{fontSize:25}}>TABLE {o.tableLabel??"—"}</strong>
       <strong style={{fontSize:14,color:"#f5ddab"}}>{minutes} min</strong>
      </div>
      <p style={{fontSize:11,color:"#b2bdcf",marginTop:6}}>
       {time(o.createdAt)} · #{o.id.slice(0,8)} · {euro(o.amountGrossCents)}
      </p>
      <strong style={{display:"block",fontSize:13,letterSpacing:1,color:o.state==="ready"?"#caff4e":"#c9ddf2",margin:"14px 0"}}>
       {labels[o.state]??o.state.toUpperCase()}
      </strong>
      <ul style={{listStyle:"none",margin:"0 0 17px",padding:0}}>
       {o.lines.map(line=><li key={line.id} style={{borderTop:"1px solid #ffffff26",padding:"10px 0",fontWeight:700}}>
        <strong style={{color:"#caff4e",fontSize:20}}>{line.quantity}×</strong> {line.description}
       </li>)}
      </ul>
      {target&&<button type="button" disabled={!canAct} onClick={()=>void advance(o)}
        style={{border:0,borderRadius:12,padding:"14px 12px",width:"100%",fontSize:15,fontWeight:900,
         background:"#caff4e",color:"#142133",cursor:canAct?"pointer":"not-allowed",opacity:canAct?1:0.45}}>
       {busy===o.id?"Saving…":nextLabels[target]}
      </button>}
      {receiptBlock&&<p role="status" style={{fontSize:12,color:"#ffa6a6"}}>
       Receipt pending. The waiter cannot mark this order delivered until fiscal issuance is verified.
      </p>}
      {o.paymentState!=="paid"&&<p style={{fontSize:12,color:"#ffa6a6"}}>Payment was reversed. Actions disabled.</p>}
     </article>;
    })}
   </div>}
  <p style={{marginTop:20,color:"#a5adbf",fontSize:12,lineHeight:1.6}}>
   Ticket status comes from the same venue order ledger used by the manager queue. No demo or unpaid orders,
   customer identifiers, payment secrets or arbitrary manual ticket creation. Lost connectivity disables actions.
  </p>
 </section>;
}

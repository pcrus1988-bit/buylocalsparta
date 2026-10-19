"use client";
import {useEffect,useMemo,useState} from "react";
import type {SessionView} from "../lib/drinkstock-session-service";
import type {GuestPricePreview} from "../lib/drinkstock-guest-quote";

const money=(c:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(c/100);
const actionStyle={border:0,borderRadius:12,padding:"10px 15px",fontWeight:900,cursor:"pointer"} as const;
const errorCopy:Record<string,string>={
 MARKET_NOT_TRADING:"The trading session is currently closed. You can view drinks but not request a price preview.",
 DRINK_NOT_AVAILABLE:"One of your selected drinks is no longer available. Update your cart.",
 BAD_ORIGIN:"Reload this page using the printed table QR.",
 NOT_FOUND:"This table QR is no longer valid. Ask the venue for a new code.",
 CART_LIMIT_EXCEEDED:"Up to 24 drinks can be selected in one preview.",
 INVALID_CART_SIZE:"Choose between 1 and 12 different drinks.",
 PREVIEW_UNAVAILABLE:"Price preview is temporarily unavailable. No order has been placed."
};
export function DrinkStockGuestCart({token,initial}:{token:string;initial:SessionView}){
 const [view,setView]=useState(initial);
 const [cart,setCart]=useState<Record<string,number>>({});
 const [connected,setConnected]=useState(true),[revoked,setRevoked]=useState(false);
 const [preview,setPreview]=useState<GuestPricePreview|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState("");
 const [now,setNow]=useState(Date.now());
 const live=view.session?.state==="running"||view.session?.state==="crashing";
 const crashUntil=view.session?.state==="crashing"?view.session.crashUntil:null;
 const crashSeconds=crashUntil?Math.max(0,Math.ceil((Date.parse(crashUntil)-now)/1000)):0;
 const totalUnits=Object.values(cart).reduce((sum,count)=>sum+count,0);
 const selected=useMemo(()=>Object.entries(cart).filter(([,count])=>count>0),[cart]);
 const unexpired=Boolean(preview&&connected&&live&&Date.parse(preview.expiresAt)>now);
 const snapshotKey=`${view.session?.id??""}:${view.session?.state??""}:${view.products.map(x=>`${x.id}:${x.priceCents}`).join("|")}`;
 const secondsRemaining=preview?Math.max(0,Math.ceil((Date.parse(preview.expiresAt)-now)/1000)):0;
 const endpoint=`/api/hospitality/public/table/${token}`;

 useEffect(()=>{setPreview(null);},[snapshotKey]);
 useEffect(()=>{
  const clock=window.setInterval(()=>setNow(Date.now()),500);
  return ()=>window.clearInterval(clock);
 },[]);
 useEffect(()=>{
  let mounted=true;
  async function refresh(){
   try{
    const response=await fetch(endpoint,{cache:"no-store",credentials:"omit"});
    if(response.status===404&&mounted)setRevoked(true);
    if(!response.ok)throw new Error("OFFLINE");
    const current=await response.json() as SessionView;
    if(mounted){setView(current);setConnected(true);setRevoked(false);}
   }catch{if(mounted){setConnected(false);setPreview(null);}}
  }
  const timer=window.setInterval(()=>{void refresh();},5000);
  return ()=>{mounted=false;window.clearInterval(timer);};
 },[endpoint]);

 function adjust(productId:string,delta:number){
  if(!connected||!live||loading)return;
  setCart(previous=>{
   const count=previous[productId]??0,next=count+delta;
   if(next<0||next>10)return previous;
   if(delta>0&&Object.values(previous).reduce((sum,q)=>sum+q,0)>=24)return previous;
   if(next>0&&count===0&&Object.keys(previous).length>=12)return previous;
   const updated={...previous};
   if(next===0)delete updated[productId];else updated[productId]=next;
   return updated;
  });
  setPreview(null);setError("");
 }
 async function calculate(){
  if(!connected||!live||!selected.length||loading)return;
  setLoading(true);setError("");setPreview(null);
  try{
   const response=await fetch(`${endpoint}/quote`,{
    method:"POST",credentials:"omit",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({items:selected.map(([productId,quantity])=>({productId,quantity}))})
   });
   const payload=await response.json() as GuestPricePreview&{error?:string};
   if(!response.ok)throw new Error(payload.error??"PREVIEW_UNAVAILABLE");
   if(payload.kind!=="price_preview_only"||payload.checkoutEnabled!==false)
    throw new Error("PREVIEW_UNAVAILABLE");
   setPreview(payload);
  }catch(cause){
   const code=cause instanceof Error?cause.message:"PREVIEW_UNAVAILABLE";
   setError(errorCopy[code]??"Cannot verify current prices. No order has been placed.");
  }finally{setLoading(false);}
 }
 const chosenProductIds=new Set(view.products.map(x=>x.id));
 return <main style={{minHeight:"100vh",background:"radial-gradient(circle at 80% 0%,#482065,#160c35 46%,#090817 100%)",color:"#fff",padding:"clamp(18px,4vw,48px)",fontFamily:"Arial,sans-serif"}}>
  <style>{`@keyframes dsGuestPulse{0%,100%{box-shadow:0 0 0 0 #ff355a77}50%{box-shadow:0 0 0 12px #ff355a00}}.ds-guest-crash{animation:dsGuestPulse 1s infinite}@media(prefers-reduced-motion:reduce){.ds-guest-crash{animation:none}}`}</style>
  <div style={{maxWidth:1120,margin:"0 auto"}}>
   <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,flexWrap:"wrap",borderBottom:"1px solid #ffffff33",paddingBottom:22}}>
    <div><p style={{letterSpacing:4,color:"#d5ff53",fontSize:11,fontWeight:900}}>DRINKSTOCK / YOUR TABLE</p>
     <h1 style={{fontSize:"clamp(34px,6vw,68px)",fontWeight:950,letterSpacing:-2,margin:"8px 0"}}>THE DRINK<span style={{color:"#d5ff53"}}> EXCHANGE.</span></h1>
     <p style={{color:"#cfc3e9",fontWeight:700,margin:0}}>{view.venue.name} · TABLE {view.tableLabel??"—"}</p>
    </div>
    <div style={{padding:"12px 18px",borderRadius:14,border:"1px solid #ffffff45",background:"#ffffff11",fontWeight:850}}>
     {!connected?"● DISCONNECTED":live?"● MARKET OPEN":"Ⅱ SESSION CLOSED"}
    </div>
   </header>
   {!connected&&<div role="alert" style={{marginTop:20,padding:22,borderRadius:16,background:"#4e1c2f"}}>
    <strong>{revoked?"This table code has been revoked.":"Reconnecting to the venue…"}</strong>
    <p>Live prices are hidden until your venue connection is verified. No purchase or payment has occurred.</p>
   </div>}
   {connected&&crashSeconds>0&&<div className="ds-guest-crash" role="status" style={{marginTop:18,padding:20,textAlign:"center",border:"2px solid #ff3f68",borderRadius:18,background:"#6b123a"}}>
    <strong style={{fontSize:"clamp(25px,5vw,46px)"}}>⚡ MARKET CRASH · BUY THE DIP</strong>
    <p style={{fontSize:25,fontWeight:900,margin:"6px 0"}}>{crashSeconds}s remaining · Market remains open</p>
   </div>}
   {connected&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:20,marginTop:28,alignItems:"start"}}>
    <section aria-label="Live drink board">
     <h2 style={{fontSize:25,margin:"0 0 14px"}}>🍹 Today's trading board</h2>
     <p style={{color:"#bdb2d9",lineHeight:1.5}}>Select drinks and request a fresh server-calculated venue price preview. Animations on venue TV screens are demonstrative only: their simulated prices are never the prices used by this cart.</p>
     {view.products.map(drink=>{
      const count=cart[drink.id]??0;
      return <article key={drink.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:15,padding:17,borderRadius:17,marginBottom:10,border:count?"1px solid #d5ff53":"1px solid #ffffff29",background:"#ffffff10"}}>
       <div style={{minWidth:0}}><strong style={{fontSize:17}}>{drink.name}</strong><small style={{display:"block",marginTop:6,color:"#b3a6d2"}}>{drink.category.toUpperCase()}</small>
        <strong style={{display:"block",marginTop:9,color:"#d5ff53",fontSize:23}}>{money(drink.priceCents)}</strong>
       </div>
       <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button type="button" disabled={!live||loading||count===0} onClick={()=>adjust(drink.id,-1)} aria-label={`Remove one ${drink.name}`} style={{...actionStyle,background:"#392b50",color:"#fff",opacity:(!live||count===0)?0.4:1}}>−</button>
        <span style={{minWidth:20,textAlign:"center",fontWeight:900}}>{count}</span>
        <button type="button" disabled={!live||loading||count===10||totalUnits>=24} onClick={()=>adjust(drink.id,1)} aria-label={`Add one ${drink.name}`} style={{...actionStyle,background:"#d5ff53",opacity:(!live||count===10||totalUnits>=24)?0.4:1}}>+</button>
       </div>
      </article>;
     })}
     {!view.products.length&&<p>No drinks listed for this venue yet.</p>}
    </section>
    <section aria-label="Guest cart" style={{background:"linear-gradient(140deg,#272043,#1c1730)",padding:22,borderRadius:22,border:"1px solid #88769f"}}>
     <p style={{color:"#d5ff53",fontSize:12,letterSpacing:3,fontWeight:900}}>YOUR TABLE / PRICE PREVIEW</p>
     <h2 style={{fontSize:28,margin:"10px 0"}}>🛒 Your drinks <span style={{color:"#d5ff53"}}>({totalUnits})</span></h2>
     {!selected.length?<p style={{color:"#c9bddb"}}>Choose a drink from the live board to start building a cart.</p>:
      <ul style={{paddingLeft:18,lineHeight:2}}>
       {selected.map(([id,qty])=>{
        const d=view.products.find(x=>x.id===id);
        return <li key={id}>{qty} × {d?.name??"Unavailable drink"} {!chosenProductIds.has(id)&&<strong style={{color:"#ffa3b8"}}> (remove)</strong>}</li>;
       })}
      </ul>}
     <button type="button" disabled={!live||!connected||!selected.length||loading} onClick={()=>void calculate()}
      style={{...actionStyle,width:"100%",padding:17,background:"#d5ff53",fontSize:16,opacity:(!live||!selected.length||loading)?0.5:1}}>
      {loading?"Verifying current prices…":"↗ CHECK CURRENT PRICE"}
     </button>
     {error&&<p role="alert" style={{color:"#ff9fae",lineHeight:1.6}}>{error}</p>}
     {preview&&<div role="status" style={{marginTop:20,padding:18,borderRadius:16,background:"#ffffff12"}}>
      <strong style={{color:unexpired?"#d5ff53":"#ffa0a0"}}>{unexpired?`Preview expires in ${secondsRemaining}s`:"Price preview expired"}</strong>
      <ul style={{paddingLeft:18}}>
       {preview.lines.map(line=><li key={line.productId} style={{padding:"6px 0"}}>{line.quantity} × {line.description} — {money(line.lineGrossCents)}</li>)}
      </ul>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,paddingTop:13,borderTop:"1px solid #ffffff36"}}>
       <strong>Displayed total</strong><strong style={{color:"#d5ff53",fontSize:23}}>{money(preview.totalGrossCents)}</strong>
      </div>
      <small style={{display:"block",color:"#bcb2d0",marginTop:10}}>Based on server prices at {new Date(preview.quotedAt).toLocaleTimeString("el-GR")}. Not a binding offer or finalized checkout.</small>
     </div>}
     <div style={{marginTop:20,padding:16,borderRadius:16,background:"#312b46",border:"1px solid #877699"}}>
      <strong>🔒 Checkout is not activated</strong>
      <p style={{fontSize:13,lineHeight:1.65,color:"#ddd2ee"}}>This cart is only a price preview. It does not send an order, reserve drinks, collect payment or issue a receipt. For now, order directly from the venue staff.</p>
      <button type="button" disabled style={{...actionStyle,background:"#847a95",color:"#fff",width:"100%",cursor:"not-allowed"}}>ONLINE PAYMENT COMING SOON</button>
     </div>
    </section>
   </div>}
   <footer style={{marginTop:30,color:"#aea2cb",fontSize:12,lineHeight:1.8}}>Your selection stays in this browser page only. Every QR is venue/table scoped and can be revoked by the manager. DrinkStock trading demo signals are not real orders.</footer>
  </div>
 </main>;
}

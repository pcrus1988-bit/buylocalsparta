"use client";
import {useEffect,useRef,useState} from "react";
import type {SessionView} from "../lib/drinkstock-session-service";
import {synchronizedShowcaseTrades} from "../lib/drinkstock-screen-showcase";
const euros=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n/100);
export function DrinkStockScreenClient({token,initial}:{token:string;initial:SessionView}){
 const [data,setData]=useState(initial),[now,setNow]=useState(Date.now()),[armed,setArmed]=useState(false);
 const [clockOffset,setClockOffset]=useState(()=>{
  const serverMs=Date.parse(initial.serverNow);
  return Number.isFinite(serverMs)?serverMs-Date.now():0;
 });
 const [connected,setConnected]=useState(true),[revoked,setRevoked]=useState(false);
 const audio=useRef<AudioContext|null>(null),lastCrash=useRef<string|null>(null);
 const crash=data.session?.state==="crashing"&&data.session.crashUntil?data.session.crashUntil:null;
 const serverNowMs=now+clockOffset;
 const seconds=crash?Math.max(0,Math.ceil((new Date(crash).getTime()-serverNowMs)/1000)):0;
 const showcase=synchronizedShowcaseTrades(data.session,data.products,serverNowMs);
 useEffect(()=>{const tick=window.setInterval(()=>setNow(Date.now()),250);return ()=>window.clearInterval(tick)},[]);
 useEffect(()=>{
 let mounted=true;
 const poll=async()=>{
  try{
   const requestedAt=Date.now();
   const response=await fetch(`/api/hospitality/public/screen/${token}`,{cache:"no-store"});
   if(response.status===404&&mounted)setRevoked(true);
   if(!response.ok)throw new Error("disconnected");
   const current=await response.json() as SessionView;
   if(mounted){
    const timestamp=Date.parse(current.serverNow);
    if(Number.isFinite(timestamp))setClockOffset(timestamp-Math.round((requestedAt+Date.now())/2));
    setData(current);setConnected(true);setRevoked(false);
   }
  }catch{if(mounted)setConnected(false);}
 };
 const tick=window.setInterval(()=>{void poll();},3000);
 return ()=>{mounted=false;window.clearInterval(tick);};
 },[token]);
 useEffect(()=>{
 if(!armed||!audio.current||!crash||lastCrash.current===crash)return;
 lastCrash.current=crash;
 const ctx=audio.current;
 if(ctx.state==="suspended")void ctx.resume();
 for(let i=0;i<4;i++){
 const osc=ctx.createOscillator(),vol=ctx.createGain(),start=ctx.currentTime+i*.38;
 osc.type="sawtooth";osc.frequency.setValueAtTime(i%2?520:790,start);
 vol.gain.setValueAtTime(0.001,start);
 vol.gain.exponentialRampToValueAtTime(.07,start+.02);
 vol.gain.exponentialRampToValueAtTime(.001,start+.27);
 osc.connect(vol);vol.connect(ctx.destination);osc.start(start);osc.stop(start+.29);
 }
 },[crash,armed]);
 function toggleSound(){
  if(armed){setArmed(false);return;}
  if(typeof AudioContext==="undefined")return;
  if(!audio.current)audio.current=new AudioContext();
  void audio.current.resume();setArmed(true);
 }
 const online=data.session?.state==="running"||data.session?.state==="crashing";
 const leadingProduct=online?showcase[0]?.productId:data.signals?.[0]?.productId;
 function fullScreen(){
  const node=document.documentElement;
  if(!document.fullscreenElement&&node.requestFullscreen)void node.requestFullscreen().catch(()=>{});
  else if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
 }
 if(!connected)return <main role="alert" style={{minHeight:"100vh",padding:"clamp(30px,8vw,110px)",background:"#100b22",color:"#fff",fontFamily:"Arial,sans-serif",textAlign:"center"}}>
  <h1 style={{fontSize:"clamp(30px,6vw,70px)"}}>DRINKSTOCK ↗</h1>
  <h2>{revoked?"Screen access revoked":"Reconnecting to the market…"}</h2>
  <p style={{color:"#c6bfda"}}>{revoked?"Ask your venue manager for a new screen link.":"Live prices are hidden until a fresh verified venue snapshot is available."}</p>
 </main>;
 return <main style={{position:"relative",overflow:"hidden",minHeight:"100vh",padding:"clamp(20px,4vw,64px)",background:crash&&seconds?"radial-gradient(circle,#40031d,#130511 67%,#080711)":"radial-gradient(circle at 45% -10%,#30276a,#0a0821 62%)",color:"#fff",fontFamily:"Arial,sans-serif"}}>
 {crash&&seconds>0&&<><style>{`@keyframes dsAlarm{0%,100%{opacity:1}50%{opacity:.08}}.ds-alert{animation:dsAlarm .55s infinite}@media(prefers-reduced-motion:reduce){.ds-alert{animation:none}}`}</style>
 <div className="ds-alert" aria-hidden="true" style={{position:"fixed",top:0,left:0,width:90,height:90,background:"radial-gradient(circle at top left,#ff122b,transparent 75%)"}}/>
 <div className="ds-alert" aria-hidden="true" style={{position:"fixed",top:0,right:0,width:90,height:90,background:"radial-gradient(circle at top right,#ff122b,transparent 75%)"}}/>
 <div className="ds-alert" aria-hidden="true" style={{position:"fixed",bottom:0,left:0,width:90,height:90,background:"radial-gradient(circle at bottom left,#ff122b,transparent 75%)"}}/>
 <div className="ds-alert" aria-hidden="true" style={{position:"fixed",bottom:0,right:0,width:90,height:90,background:"radial-gradient(circle at bottom right,#ff122b,transparent 75%)"}}/>
 <div role="alert" style={{position:"sticky",top:10,zIndex:4,textAlign:"center",padding:22,borderRadius:20,border:"3px solid #ff345a",background:"#720921eb",boxShadow:"0 0 80px #f03"}}>
 <strong style={{display:"block",fontSize:"clamp(28px,5vw,72px)",fontWeight:950}}>⚠ MARKET CRASH ⚠</strong>
 <span style={{fontSize:"clamp(38px,7vw,95px)",fontWeight:950}}>{seconds.toString().padStart(2,"0")}s</span>
 </div></>}
 <header style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",alignItems:"center",borderBottom:"1px solid #ffffff30",paddingBottom:22}}>
 <div><div style={{fontWeight:950,fontSize:"clamp(24px,3vw,50px)",letterSpacing:-2}}>DRINK<span style={{color:"#caff50"}}>STOCK</span> ↗</div>
 <div style={{fontSize:12,letterSpacing:3,color:"#beb5e7"}}>{data.venue.name.toUpperCase()} / THE PARTY MARKET</div></div>
 <div style={{display:"flex",gap:12,alignItems:"center"}}><strong style={{color:online?"#caff50":"#ffacac"}}>{online?"● LIVE SESSION":"Ⅱ MARKET CLOSED"}</strong>
 <button onClick={toggleSound} style={{background:armed?"#d3ff53":"#23203f",color:armed?"#111":"#fff",border:"1px solid #caff50",borderRadius:12,padding:"12px 16px",cursor:"pointer"}}>{armed?"🔊 ALARM ON · MUTE":"🔈 ENABLE ALARM"}</button>
 <button onClick={fullScreen} style={{background:"#23203f",color:"#fff",border:"1px solid #746a98",borderRadius:12,padding:"12px 16px",cursor:"pointer"}}>⛶ FULLSCREEN</button></div>
 </header>
 <h1 style={{fontSize:"clamp(34px,6vw,78px)",fontWeight:950,letterSpacing:-4,margin:"34px 0 22px"}}>THE DRINK EXCHANGE<span style={{color:"#caff50"}}>.</span></h1>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,270px),1fr))",gap:13}}>
 {data.products.map(product=><article key={product.id} style={{background:leadingProduct===product.id?"#d9ff571c":"#ffffff11",border:leadingProduct===product.id?"2px solid #d9ff57":"1px solid #ffffff27",borderRadius:16,padding:22}}>
 <div style={{color:"#ad9ed9",fontSize:11,letterSpacing:2}}>{product.category.toUpperCase()}</div>
 <h2 style={{fontSize:"clamp(19px,2.5vw,31px)",margin:"12px 0"}}>{product.name}</h2>
 <strong style={{fontSize:"clamp(30px,4vw,52px)",color:crash?"#ff6281":"#ccff50"}}>{euros(product.priceCents)}</strong></article>)}
 </div>
 {online&&<section aria-label="Synchronized demonstration trades" style={{marginTop:28,padding:22,borderRadius:18,background:"#271235",border:"1px solid #ccff50a0"}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <h2 style={{margin:0,fontSize:"clamp(20px,3vw,34px)"}}>↗ PARTY TICKER · DEMO</h2>
   <strong style={{fontSize:12,letterSpacing:1.5,color:"#ffb4e1"}}>
    SYNCHRONIZED SIMULATION · NEVER REAL ORDERS
   </strong>
  </div>
  <p style={{color:"#c3b4dd",fontSize:13}}>Animated sample buys run across remote screens, including every 1.7 seconds during a market crash. These do not change charged prices or represent real customer purchases.</p>
  {!showcase.length?<p style={{color:"#caff50"}}>Starting the synchronized demonstration feed…</p>:
   <ol style={{paddingLeft:22,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,210px),1fr))",gap:12}}>
    {showcase.map((trade,index)=><li key={trade.key} style={{padding:"15px 13px",borderRadius:13,background:index===0?"#d9ff5726":"#ffffff10",border:index===0?"1px solid #d9ff57":"1px solid #ffffff22"}}>
     <strong style={{color:trade.crash?"#ff6688":"#caff50"}}>{trade.crash?"⚡ CRASH DEMO BUY":"↗ DEMO BUY"}</strong>
     <div style={{fontSize:19,fontWeight:900,marginTop:8}}>{trade.quantity}× {trade.productName}</div>
     <small style={{display:"block",marginTop:6,color:"#b6a8d3"}}>{trade.demoTable} · {new Date(trade.occurredAtMs).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small>
    </li>)}
   </ol>}
 </section>}
 {!online&&<section aria-label="Rehearsal market tape" style={{marginTop:28,padding:22,borderRadius:18,background:"#ffffff0c",border:"1px solid #ffffff2b"}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <h2 style={{margin:0,fontSize:"clamp(20px,3vw,34px)"}}>⚡ MARKET TAPE</h2>
   <span style={{fontSize:12,letterSpacing:2,color:"#e5b2ff"}}>MANUAL REHEARSAL SIGNALS · NOT GUEST ORDERS</span>
  </div>
  {!data.signals?.length?<p style={{color:"#bcb2d5"}}>No rehearsal demand signals recorded yet.</p>:
   <ol style={{paddingLeft:22,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:13}}>
    {data.signals.map(signal=><li key={signal.id} style={{padding:"14px 12px",borderRadius:13,background:"#281b43",fontWeight:700}}>
     <span style={{color:"#d9ff57"}}>↗ SIGNAL</span> · {signal.productName}
     <small style={{display:"block",marginTop:6,color:"#ada5c6"}}>{new Date(signal.createdAt).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small>
    </li>)}
   </ol>}
 </section>}
 <footer style={{paddingTop:35,color:"#b3aac9",fontSize:12}}>Prices are venue-managed. This screen is view-only. Rehearsal signals are simulations, never confirmed guest orders. Customer checkout, charging and official receipts are not active. Separate links are needed for each venue.</footer>
 </main>;
}

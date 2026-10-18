"use client";
import {useEffect,useRef,useState} from "react";
import type {SessionView} from "../lib/drinkstock-session-service";
const euros=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n/100);
export function DrinkStockScreenClient({token,initial}:{token:string;initial:SessionView}){
 const [data,setData]=useState(initial),[now,setNow]=useState(Date.now()),[armed,setArmed]=useState(false);
 const audio=useRef<AudioContext|null>(null),lastCrash=useRef<string|null>(null);
 const crash=data.session?.state==="crashing"&&data.session.crashUntil?data.session.crashUntil:null;
 const seconds=crash?Math.max(0,Math.ceil((new Date(crash).getTime()-now)/1000)):0;
 useEffect(()=>{const tick=window.setInterval(()=>setNow(Date.now()),250);return ()=>window.clearInterval(tick)},[]);
 useEffect(()=>{
 const tick=window.setInterval(()=>fetch(`/api/hospitality/public/screen/${token}`,{cache:"no-store"})
 .then(async r=>{if(!r.ok)throw new Error("disconnected");return r.json() as Promise<SessionView>})
 .then(setData).catch(()=>{}),3000);
 return ()=>window.clearInterval(tick);
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
 function enableSound(){
 if(!audio.current)audio.current=new AudioContext();
 void audio.current.resume();setArmed(true);
 }
 const online=data.session?.state==="running"||data.session?.state==="crashing";
 return <main style={{position:"relative",overflow:"hidden",minHeight:"100vh",padding:"clamp(20px,4vw,64px)",background:crash&&seconds?"radial-gradient(circle,#40031d,#130511 67%,#080711)":"radial-gradient(circle at 45% -10%,#30276a,#0a0821 62%)",color:"#fff",fontFamily:"Arial,sans-serif"}}>
 {crash&&seconds>0&&<><style>{`@keyframes dsAlarm{0%,100%{opacity:1}50%{opacity:.08}}.ds-alert{animation:dsAlarm .55s infinite}`}</style>
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
 <button onClick={enableSound} style={{background:armed?"#d3ff53":"#23203f",color:armed?"#111":"#fff",border:"1px solid #caff50",borderRadius:12,padding:"12px 16px",cursor:"pointer"}}>{armed?"🔊 ALARM ON":"🔈 ENABLE ALARM"}</button></div>
 </header>
 <h1 style={{fontSize:"clamp(34px,6vw,78px)",fontWeight:950,letterSpacing:-4,margin:"34px 0 22px"}}>THE DRINK EXCHANGE<span style={{color:"#caff50"}}>.</span></h1>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,270px),1fr))",gap:13}}>
 {data.products.map(product=><article key={product.id} style={{background:"#ffffff11",border:"1px solid #ffffff27",borderRadius:16,padding:22}}>
 <div style={{color:"#ad9ed9",fontSize:11,letterSpacing:2}}>{product.category.toUpperCase()}</div>
 <h2 style={{fontSize:"clamp(19px,2.5vw,31px)",margin:"12px 0"}}>{product.name}</h2>
 <strong style={{fontSize:"clamp(30px,4vw,52px)",color:crash?"#ff6281":"#ccff50"}}>{euros(product.priceCents)}</strong></article>)}
 </div>
 <footer style={{paddingTop:35,color:"#b3aac9",fontSize:12}}>Prices are venue-managed. This screen is view-only. Public demonstration mode does not accept or charge customer orders. Separate links are needed for each venue.</footer>
 </main>;
}

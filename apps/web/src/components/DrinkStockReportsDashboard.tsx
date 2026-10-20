import Link from "next/link";
import type {DrinkStockPartnerReport} from "../lib/drinkstock-reports-service";
const euro=(c:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(c/100);
const date=(d:string|null)=>d?new Date(d).toLocaleString("el-GR",{dateStyle:"medium",timeStyle:"short"}):"—";
const block:React.CSSProperties={background:"#ffffff0c",border:"1px solid #ffffff27",borderRadius:19,padding:22};
export function DrinkStockReportsDashboard({report}:{report:DrinkStockPartnerReport}){
 const base=`/drinkstock/dashboard/${report.partnerId}/reports`;
 const max=Math.max(1,...report.daily.map(d=>d.grossCents));
 return <div style={{maxWidth:1250,margin:"0 auto",padding:"24px 18px 65px",color:"#fff",fontFamily:"Arial,sans-serif"}}>
 <div style={{marginBottom:24}}>
  <Link href={`/drinkstock/dashboard/${report.partnerId}`} style={{color:"#caff4e"}}>← Partner dashboard</Link>
  <p style={{color:"#c3ff70",fontSize:12,letterSpacing:3,fontWeight:900,marginTop:24}}>DRINKSTOCK / VENUE INTELLIGENCE</p>
  <h1 style={{fontSize:"clamp(32px,5vw,56px)",lineHeight:1.07,letterSpacing:-2,margin:"8px 0"}}>Trading reports<span style={{color:"#caff4e"}}>.</span></h1>
  <p style={{color:"#c6bdd9"}}>{report.partnerName} · Private owner/manager reports · Data updated {date(report.generatedAt)}</p>
 </div>
 <nav aria-label="Report date range" style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
 {[7,30,90].map(days=><Link key={days} href={`${base}?days=${days}`} aria-current={report.days===days?"page":undefined}
 style={{padding:"11px 16px",borderRadius:12,border:"1px solid #ffffff35",
 color:report.days===days?"#15112e":"#fff",background:report.days===days?"#caff4e":"#28233e",fontWeight:850,textDecoration:"none"}}>Last {days} days</Link>)}
 </nav>
 <p role="note" style={{padding:16,borderLeft:"4px solid #f0bc70",background:"#a45c1624",borderRadius:10,color:"#ffe9c3",fontSize:14,lineHeight:1.65}}>
  <strong>Reporting integrity:</strong> Commercial totals are derived only from orders with a matching, non-demo provider verification event and exact gross payment amount. Demo trading signals are displayed separately and never count as revenue. This is an operational order-value report, not an accounting or VAT return. Payment capture and fiscal issuance remain disabled until certified integration.
 </p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12,margin:"23px 0"}}>
 {[
  {label:"Provider-verified order value",value:euro(report.totals.verifiedGrossCents),detail:"Gross, active paid orders only"},
  {label:"Confirmed paid orders",value:report.totals.verifiedPaidOrders.toLocaleString("el-GR"),detail:"Cancelled/refunded excluded"},
  {label:"Trading sessions",value:report.totals.sessions.toLocaleString("el-GR"),detail:"All venue sessions"},
  {label:"Simulation demand signals",value:report.totals.demoDemandSignals.toLocaleString("el-GR"),detail:"Never counted as purchases"},
  {label:"Active TV screens",value:String(report.totals.actualScreens+report.totals.simulationScreens),detail:`${report.totals.actualScreens} actual · ${report.totals.simulationScreens} simulation`},
  {label:"Reversed / partial-refund orders",value:String(report.totals.reversalAffectedOrders),detail:"Count only, not assumed refund value"}
 ].map(item=><div key={item.label} style={{...block,minHeight:132}}>
  <p style={{fontSize:12,color:"#bdb3d2",letterSpacing:.5,margin:0}}>{item.label}</p>
  <strong style={{display:"block",fontSize:"clamp(25px,3vw,34px)",margin:"11px 0",color:"#caff4e"}}>{item.value}</strong>
  <small style={{color:"#c6bed6"}}>{item.detail}</small>
 </div>)}
 </div>
 <section aria-label="Venue comparison" style={{...block,marginTop:18}}>
  <h2 style={{fontSize:27,margin:"0 0 5px"}}>🏠 Venues</h2>
  <p style={{color:"#bbb0d2",fontSize:13}}>Each venue is isolated. Revenue figures are exclusively provider-verified orders.</p>
  {!report.venues.length?<p>No active venues available for this partner.</p>:
  <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",minWidth:700,width:"100%",textAlign:"left",fontSize:14}}>
   <thead><tr>{["Venue","Verified orders","Gross order value","Sessions","Demo signals","Actual / demo TVs"].map(x=><th key={x} style={{padding:12,borderBottom:"1px solid #ffffff55",color:"#ddd4ec"}}>{x}</th>)}</tr></thead>
   <tbody>{report.venues.map(v=><tr key={v.id}>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}><Link href={`/drinkstock/dashboard/${report.partnerId}/venues/${v.id}`} style={{color:"#caff4e"}}>{v.name} ↗</Link></td>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{v.verifiedPaidOrders}</td>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{euro(v.verifiedGrossCents)}</td>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{v.sessionCount}</td>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{v.demoDemandSignals}</td>
    <td style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{v.screensActual} / {v.screensSimulation}</td>
   </tr>)}</tbody>
  </table></div>}
 </section>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,390px),1fr))",gap:16,marginTop:18}}>
  <section aria-label="Daily provider-confirmed order values" style={block}>
   <h2 style={{fontSize:23,marginTop:0}}>📈 Verified activity by day</h2>
   {!report.daily.length?<p style={{color:"#c9c1db"}}>No provider-verified paid DrinkStock orders in the selected period. Simulation activity is intentionally excluded.</p>:
   <div style={{display:"grid",gap:10}}>{report.daily.map(d=><div key={d.day} style={{display:"grid",gridTemplateColumns:"88px minmax(0,1fr) 95px",alignItems:"center",gap:10,fontSize:12}}>
    <span>{d.day.slice(5)}</span><div style={{height:13,background:"#ffffff15",borderRadius:7}}>
     <div style={{height:"100%",width:`${Math.max(2,Math.round(d.grossCents/max*100))}%`,background:"#caff4e",borderRadius:7}}/>
    </div><span style={{textAlign:"right"}}>{euro(d.grossCents)}</span>
   </div>)}</div>}
  </section>
  <section aria-label="Verified top drink products" style={block}>
   <h2 style={{fontSize:23,marginTop:0}}>🍹 Top verified drinks</h2>
   {!report.topDrinks.length?<p style={{color:"#c9c1db"}}>No verified drink sales yet. Demo buys will not appear here.</p>:
    <ol style={{paddingLeft:24}}>{report.topDrinks.map((p,i)=><li key={i} style={{padding:"9px 0",borderBottom:"1px solid #ffffff25"}}>
     <strong>{p.name}</strong><span style={{display:"block",fontSize:12,color:"#c6bcda"}}>{p.quantity} drinks · {euro(p.grossCents)} gross</span>
    </li>)}</ol>}
  </section>
 </div>
 <section aria-label="Evidence-based commercial demand pressure" style={{...block,marginTop:18}}>
  <h2 style={{fontSize:25,margin:"0 0 8px"}}>↗ Verified-order demand pressure</h2>
  <p style={{color:"#cabfe0",lineHeight:1.6,fontSize:13}}>
   A private view of drink demand from orders with matching payment-provider evidence.
   Products compete <strong>only within the same venue</strong>. The displayed next prices are
   an <strong>indicative calculation</strong> using your existing price limits — they are never
   charged, saved as new prices, or presented as live customer quotes.
   Neither demo orders nor unpaid/refunded orders count.
  </p>
  {!report.verifiedDemand.some(v=>v.verifiedUnits>0)?
   <p style={{padding:18,background:"#ffffff0a",borderRadius:12,color:"#e2cbb0"}}>
    No eligible paid DrinkStock order evidence in the selected period. Automatic
    commercial repricing remains disabled until the certified payment adapter is active.
   </p>:
   <div style={{display:"grid",gap:16}}>
    {report.verifiedDemand.filter(v=>v.verifiedUnits>0).map(venue=>{
     const name=report.venues.find(v=>v.id===venue.venueId)?.name??"Venue";
     const ranked=[...venue.products].sort((a,b)=>b.verifiedUnits-a.verifiedUnits||a.name.localeCompare(b.name)).slice(0,6);
     return <div key={venue.venueId} style={{padding:18,borderRadius:15,background:"#100c23",border:"1px solid #4d4c69"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:11}}>
       <strong>{name}</strong><span style={{color:"#b9dca3",fontSize:12}}>
        {venue.verifiedUnits.toLocaleString("el-GR")} evidenced drinks · {venue.productsWithVerifiedSales} ordered products
       </span>
      </div>
      <div style={{display:"grid",gap:8}}>
       {ranked.map(drink=><div key={drink.productId} style={{display:"grid",gridTemplateColumns:"minmax(100px,1fr) minmax(92px,auto)",gap:10,padding:"10px 0",borderTop:"1px solid #ffffff20",alignItems:"center"}}>
        <div style={{minWidth:0}}>
         <strong style={{fontSize:14}}>{drink.name}</strong>
         <small style={{display:"block",color:"#afa8bf",marginTop:5}}>{drink.verifiedUnits.toLocaleString("el-GR")} units · {drink.weightPercent.toFixed(1)}% of venue buys</small>
        </div>
        <div style={{textAlign:"right"}}>
         <strong style={{color:drink.movementCents>0?"#caff4e":drink.movementCents<0?"#f6b3b3":"#ddd"}}>
          {drink.movementCents>0?"↗":drink.movementCents<0?"↘":"→"} {euro(drink.indicativeCents)}
         </strong>
         <small style={{display:"block",color:"#bcb2cb",marginTop:5}}>illustrative · from {euro(drink.currentCents)}</small>
        </div>
       </div>)}
      </div>
     </div>;
    })}
   </div>}
  <p style={{fontSize:12,color:"#b9acc8",marginTop:15}}>
   Read-only preview. An authenticated PSP webhook, idempotent order-to-market event processing,
   and atomic quote updates are required before commercial repricing can be enabled.
  </p>
 </section>
 <section aria-label="Recent trading sessions" style={{...block,marginTop:18}}>
  <h2 style={{fontSize:23,marginTop:0}}>⏱ Recent sessions</h2>
  {!report.recentSessions.length?<p style={{color:"#c9c1db"}}>No sessions in the chosen reporting period.</p>:
  <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:600,borderCollapse:"collapse",textAlign:"left",fontSize:13}}>
   <thead><tr>{["Venue","State","Started","Ended","Price band"].map(k=><th key={k} style={{padding:12,borderBottom:"1px solid #ffffff40"}}>{k}</th>)}</tr></thead>
   <tbody>{report.recentSessions.map(s=><tr key={s.id}>{[
    s.venueName,s.state.toUpperCase(),date(s.startedAt),date(s.endedAt),
    `${s.floorPercent}%–${s.ceilingPercent}%`
   ].map((x,i)=><td key={i} style={{padding:12,borderBottom:"1px solid #ffffff20"}}>{x}</td>)}</tr>)}</tbody>
  </table></div>}
 </section>
 </div>;
}

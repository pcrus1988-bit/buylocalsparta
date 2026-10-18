import {notFound} from "next/navigation";
import {publicSessionView,SessionError} from "../../../../../lib/drinkstock-session-service";
export const dynamic="force-dynamic";
export const metadata={title:"DrinkStock · Table Menu",robots:{index:false,follow:false},referrer:"no-referrer"};
const money=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n/100);
export default async function TableMenu({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 let data;
 try{data=await publicSessionView(token,"table");}
 catch(error){if(error instanceof SessionError&&error.status===404)notFound();
 return <main style={{padding:40}}><h1>Menu unavailable</h1></main>;}
 const running=data.session?.state==="running";
 return <main style={{minHeight:"100vh",padding:"32px 18px",background:"linear-gradient(140deg,#181036,#0c0820)",fontFamily:"Arial,sans-serif",color:"#fff"}}>
 <section style={{maxWidth:620,margin:"0 auto"}}>
 <p style={{color:"#caff50",fontSize:12,letterSpacing:3}}>DRINKSTOCK / YOUR TABLE</p>
 <h1 style={{fontSize:"clamp(34px,6vw,58px)",letterSpacing:-2,margin:"10px 0"}}>{data.venue.name}</h1>
 <p style={{color:"#d5caf5"}}>Table {data.tableLabel} · {running?"● Trading is live":"Trading is currently closed"}</p>
 <h2 style={{marginTop:35}}>Today's drink board</h2>
 {data.products.map(d=><article key={d.id} style={{padding:18,marginBottom:10,borderRadius:16,display:"flex",gap:14,justifyContent:"space-between",background:"#ffffff13",border:"1px solid #ffffff1d"}}>
 <div><strong>{d.name}</strong><small style={{display:"block",color:"#b9aedb",marginTop:7}}>{d.category}</small></div>
 <strong style={{color:"#d2ff5d",fontSize:22,whiteSpace:"nowrap"}}>{money(d.priceCents)}</strong>
 </article>)}
 <div role="status" style={{marginTop:28,padding:20,borderRadius:18,background:"#31274c",border:"1px solid #a999d1"}}>
 <strong>Table identified successfully</strong>
 <p style={{lineHeight:1.6}}>Online ordering and payment are not active yet. Please place your order with the venue staff. Shown prices are not a payment offer until the commercial checkout is enabled.</p>
 </div>
 <p style={{fontSize:12,color:"#a9a0c1",marginTop:28}}>This table QR works only for this venue and can be revoked by its manager.</p>
 </section></main>;
}

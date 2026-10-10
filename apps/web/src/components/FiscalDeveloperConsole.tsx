"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Client={id:string;label:string;kind:string;tokenHint:string;expiresAt:string;revokedAt:string|null};
export function FiscalDeveloperConsole({organizationId,csrfToken,initialClients}:{
 organizationId:string;csrfToken:string;initialClients:Client[];
}){
 const router=useRouter();
 const [label,setLabel]=useState("My ERP"),[kind,setKind]=useState<"external_erp"|"marketplace">("external_erp");
 const [clients,setClients]=useState(initialClients),[secret,setSecret]=useState("");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(data:Record<string,string>){
  setBusy(true);setError("");
  try{
   const response=await fetch("/timologio/api/clients",{method:"POST",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({organizationId,...data})});
   const result=await response.json() as {error?:string;id?:string;token?:string;expiresAt?:string};
   if(!response.ok)throw new Error(result.error??"API_ACTION_FAILED");
   if(data.action==="create"&&result.token&&result.id){
    setSecret(result.token);
    setClients(items=>[{id:result.id!,label,kind,tokenHint:result.token!.slice(0,18),expiresAt:result.expiresAt??"",revokedAt:null},...items]);
   }
   if(data.action==="revoke"){setClients(items=>items.map(item=>item.id===data.clientId?{...item,revokedAt:new Date().toISOString()}:item));setSecret("");}
   if(data.action==="revoke")router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Δεν ολοκληρώθηκε η ενέργεια");}
  finally{setBusy(false);}
 }
 return <div className="fiscal-section">
  <h2>Δημιουργία δοκιμαστικών διαπιστευτηρίων</h2>
  <p className="fiscal-muted">Κάθε κλειδί έχει πρόσβαση μόνο στα drafts της επιλεγμένης επιχείρησης και λήγει σε 30 ημέρες. Δεν εκδίδει φορολογικά παραστατικά.</p>
  <div className="fiscal-form">
   <label>Όνομα ενσωμάτωσης<input maxLength={100} minLength={3} value={label} onChange={e=>setLabel(e.target.value)}/></label>
   <label>Σύστημα
    <select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
     <option value="external_erp">External ERP / E-shop</option><option value="marketplace">KONTA MOY Marketplace</option>
    </select>
   </label>
   <button className="fiscal-button" disabled={busy} onClick={()=>submit({action:"create",label,kind})} type="button">Δημιουργία test API key</button>
  </div>
  {error&&<p className="fiscal-error" role="alert">{error}</p>}
  {secret&&<section className="fiscal-card" style={{marginTop:18,background:"#fff7df"}}>
   <strong>Αντιγράψτε το κλειδί τώρα — εμφανίζεται μόνο μία φορά.</strong>
   <p style={{overflowWrap:"anywhere",fontFamily:"monospace",marginTop:10}}>{secret}</p>
   <button className="fiscal-button" type="button" onClick={()=>navigator.clipboard.writeText(secret)}>Αντιγραφή κλειδιού</button>
  </section>}
  <h2 style={{marginTop:28}}>Συνδεδεμένες εφαρμογές</h2>
  {!clients.length?<p className="fiscal-muted">Δεν υπάρχουν ακόμη API keys.</p>:
   <div style={{overflowX:"auto"}}><table className="fiscal-table"><thead><tr><th>Εφαρμογή</th><th>Key prefix</th><th>Λήξη</th><th>Κατάσταση</th><th>Ενέργεια</th></tr></thead><tbody>
    {clients.map(client=><tr key={client.id}>
     <td><strong>{client.label}</strong><small style={{display:"block"}}>{client.kind}</small></td>
     <td><code>{client.tokenHint}…</code></td><td>{client.expiresAt?new Date(client.expiresAt).toLocaleDateString("el-GR"):"—"}</td>
     <td>{client.revokedAt?"Revoked":"Test / Draft-only"}</td>
     <td>{!client.revokedAt&&<button className="fiscal-button secondary" type="button" disabled={busy} onClick={()=>submit({action:"revoke",clientId:client.id})}>Ανάκληση</button>}</td>
    </tr>)}
   </tbody></table></div>}
 </div>;
}

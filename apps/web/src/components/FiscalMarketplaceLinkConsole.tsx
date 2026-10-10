"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type LinkRecord={id:string;marketplace_vendor_public_id:string;issuer_vat_number:string;linked_at:string;revoked_at:string|null};
export function FiscalMarketplaceLinkConsole({organizationId,csrfToken,verified,initialLinks,marketplaceLinkUrl}:{
 organizationId:string;csrfToken:string;verified:boolean;initialLinks:LinkRecord[];marketplaceLinkUrl:string;
}){
 const router=useRouter();
 const [code,setCode]=useState(""),[expires,setExpires]=useState("");
 const [links,setLinks]=useState(initialLinks),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function action(input:Record<string,string>){
  setBusy(true);setError("");
  try{
   const res=await fetch("/timologio/api/marketplace-links",{method:"POST",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({organizationId,...input})});
   const data=await res.json() as {code?:string;expiresAt?:string;error?:string};
   if(!res.ok)throw new Error(data.error??"PAIRING_ACTION_FAILED");
   if(input.action==="create"){setCode(data.code??"");setExpires(data.expiresAt??"");}
   if(input.action==="revoke"){
    setLinks(prev=>prev.map(l=>l.id===input.linkId?{...l,revoked_at:new Date().toISOString()}:l));
    setCode("");
    router.refresh();
   }
  }catch(e){setError(e instanceof Error?e.message:"Δεν ολοκληρώθηκε η ενέργεια");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-section">
  <h2>KONTA MOY Marketplace · σύνδεση λογαριασμών</h2>
  <p className="fiscal-muted">Συνδέστε προαιρετικά την επιχείρησή σας με την ίδια επιχείρηση στο marketplace. Η διαδικασία δεν παρέχει δυνατότητα έκδοσης παραστατικών.</p>
  {!verified?<p className="fiscal-alert">Η σύνδεση απαιτεί ολοκληρωμένη επαλήθευση της επιχείρησής σας από το FISCAL. Ο λογαριασμός σας δεν έχει ακόμα αυτή την κατάσταση.</p>:
   <><button className="fiscal-button" disabled={busy} type="button" onClick={()=>action({action:"create"})}>Δημιουργία κωδικού σύνδεσης · 10 λεπτά</button>
    {code&&<div className="fiscal-card" style={{marginTop:14,background:"#fff7df"}}>
     <strong>Μοναδικός κωδικός – εμφανίζεται μόνο εδώ</strong>
     <p style={{fontFamily:"monospace",overflowWrap:"anywhere",margin:"12px 0"}}>{code}</p>
     <p>Λήξη: {expires?new Date(expires).toLocaleString("el-GR"):"—"}</p>
     <button className="fiscal-button" type="button" onClick={()=>navigator.clipboard.writeText(code)}>Αντιγραφή</button>
     <p>Συνδεθείτε με τον λογαριασμό ιδιοκτήτη καταστήματος και εισαγάγετέ τον στην <a href={marketplaceLinkUrl}>επιβεβαίωση marketplace</a>.</p>
    </div>}
   </>}
  {error&&<p className="fiscal-error" role="alert">{error}</p>}
  <h3 style={{marginTop:22}}>Ιστορικό συνδέσεων</h3>
  {!links.length?<p className="fiscal-muted">Δεν υπάρχουν ακόμη συνδεδεμένα καταστήματα.</p>:
   <div style={{overflowX:"auto"}}><table className="fiscal-table"><thead><tr><th>Marketplace vendor</th><th>ΑΦΜ εκδότη</th><th>Ημερομηνία</th><th>Κατάσταση</th></tr></thead>
    <tbody>{links.map(l=><tr key={l.id}>
     <td>{l.marketplace_vendor_public_id}</td><td>{l.issuer_vat_number}</td>
     <td>{new Date(l.linked_at).toLocaleDateString("el-GR")}</td>
     <td>{l.revoked_at?"Ανακλήθηκε":<button disabled={busy} className="fiscal-button secondary" type="button" onClick={()=>action({action:"revoke",linkId:l.id})}>Ανάκληση</button>}</td>
    </tr>)}</tbody></table></div>}
 </section>;
}

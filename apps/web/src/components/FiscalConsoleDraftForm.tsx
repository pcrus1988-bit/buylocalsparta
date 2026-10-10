"use client";
import Link from "next/link";
import {FiscalPreviewWorkbench} from "./FiscalPreviewWorkbench";
import type {FiscalPreviewResult} from "../lib/fiscal-preview-calculator";
import {useRef,useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";

type Lane="b2c"|"pos"|"b2b"|"b2g";
type Result={id:string;created:boolean};
const messages:Record<string,string>={
 CONSOLE_DRAFT_NOT_AUTHORIZED:"Η επιχείρηση πρέπει να είναι εγκεκριμένη και να έχετε ρόλο ιδιοκτήτη ή λογιστή.",
 INVALID_GROSS_AMOUNT:"Ελέγξτε το δοκιμαστικό ποσό.",
 INVALID_REFERENCE:"Η αναφορά πρέπει να περιέχει 1–120 χαρακτήρες.",
 IDEMPOTENCY_CONFLICT:"Υπάρχει σύγκρουση στο αναγνωριστικό αυτής της δοκιμής.",
 PREVIEW_TOTAL_MISMATCH:"Το συνολικό ποσό δεν συμφωνεί με τον επανυπολογισμό των γραμμών.",
 PREVIEW_AMOUNT_OUT_OF_RANGE:"Το δοκιμαστικό ποσό υπερβαίνει το μέγιστο επιτρεπτό όριο.",
 CSRF_FAILED:"Η συνεδρία έληξε. Ανανεώστε τη σελίδα.",
 FISCAL_CONSOLE_UNAVAILABLE:"Η υπηρεσία δοκιμών δεν είναι προσωρινά διαθέσιμη."
};

function eurosToMinor(input:string):number|null{
 const match=/^([0-9]{1,10})(?:[,.]([0-9]{1,2}))?$/.exec(input.trim());
 if(!match)return null;
 const value=Number(match[1])*100+Number((match[2]??"").padEnd(2,"0"));
 return Number.isSafeInteger(value)&&value>=0&&value<=1e12?value:null;
}
export function FiscalConsoleDraftForm({organizationId,csrfToken}:{
 organizationId:string;csrfToken:string;
}){
 const router=useRouter();
 const [lane,setLane]=useState<Lane>("b2b");
 const [reference,setReference]=useState("");
 const [amount,setAmount]=useState("");
 const [appliedPreview,setAppliedPreview]=useState<FiscalPreviewResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState<Result|null>(null);
 const externalIdRef=useRef<string|null>(null);
 const edit=()=>{externalIdRef.current=null;setError("");setResult(null);setAppliedPreview(null)};
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const grossMinor=eurosToMinor(amount);
  if(grossMinor===null){setError("Εισαγάγετε έγκυρο ποσό EUR με έως δύο δεκαδικά ψηφία.");return}
  if(!reference.trim()||reference.trim().length>120){setError(messages.INVALID_REFERENCE);return}
  if(appliedPreview&&appliedPreview.totals.grossMinor!==grossMinor){setError("Το δοκιμαστικό σύνολο δεν συμφωνεί με τις γραμμές.");return}
  setBusy(true);setError("");setResult(null);
  const externalId=externalIdRef.current??("CONSOLE-"+crypto.randomUUID());
  externalIdRef.current=externalId;
  try{
   const response=await fetch("/timologio/api/console/drafts",{
    method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({organizationId,lane,externalId,reference:reference.trim(),grossMinor,
     ...(appliedPreview?{items:appliedPreview.items.map(({description,quantityMilli,unitPriceMinor,vatRateBps,discountBps})=>({description,quantityMilli,unitPriceMinor,vatRateBps,discountBps}))}:{})}),
    cache:"no-store",signal:AbortSignal.timeout(12000)
   });
   const payload=await response.json() as {error?:string;id?:string;created?:boolean;status?:string};
   if(!response.ok||!payload.id||payload.status!=="draft")
    throw new Error(messages[payload.error??""]??"Η αποθήκευση του δοκιμαστικού draft απέτυχε.");
   setResult({id:payload.id,created:payload.created===true});
   externalIdRef.current=null;setReference("");setAmount("");setAppliedPreview(null);
   router.refresh();
  }catch(cause){
   setError(cause instanceof Error?cause.message:"Η αποθήκευση απέτυχε.");
  }finally{setBusy(false)}
 }
 return <section className="fiscal-section" aria-label="Νέο δοκιμαστικό draft">
  <h2>Νέο δοκιμαστικό draft</h2>
  <p className="fiscal-muted">Η δημιουργία επιτρέπεται μόνο σε εγκεκριμένες επιχειρήσεις και εξουσιοδοτημένους ιδιοκτήτες/λογιστές. Κάθε εγγραφή είναι μη φορολογική.</p>
  <form className="fiscal-form" onSubmit={submit} style={{maxWidth:"100%",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",alignItems:"end"}}>
   <label>Κατηγορία
    <select value={lane} onChange={e=>{setLane(e.target.value as Lane);edit()}} disabled={busy}>
     <option value="b2c">B2C · Λιανική</option><option value="pos">POS · Κατάστημα</option>
     <option value="b2b">B2B · Επιχείρηση</option><option value="b2g">B2G · Δημόσιο</option>
    </select>
   </label>
   <label>Αναφορά δοκιμής
    <input value={reference} onChange={e=>{setReference(e.target.value);externalIdRef.current=null;setError("");setResult(null)}}
     maxLength={120} required placeholder="π.χ. ΠΡΟΧΕΙΡΟ-001" disabled={busy}/>
   </label>
   <label>Συνολικό ποσό EUR (δοκιμή)
    <input value={amount} onChange={e=>{setAmount(e.target.value);edit()}}
     inputMode="decimal" autoComplete="off" required placeholder="125,00" disabled={busy}/>
   </label>
   <button type="submit" className="fiscal-button" disabled={busy}>{busy?"Αποθήκευση…":"Αποθήκευση δοκιμής"}</button>
  </form>
  <FiscalPreviewWorkbench key={organizationId+":"+lane} csrfToken={csrfToken} lane={lane} onApplyPreview={preview=>{
    edit();
    setAmount(Math.floor(preview.totals.grossMinor/100)+","+String(preview.totals.grossMinor%100).padStart(2,"0"));
    setAppliedPreview(preview);
  }}/>
  {appliedPreview?<p className="fiscal-muted" role="status">{appliedPreview.items.length} γραμμές επισυνάφθηκαν στο δοκιμαστικό draft. Η αποθήκευση θα επανυπολογίσει το σύνολο στον server.</p>:null}
  {error?<p className="fiscal-error" role="alert">{error}</p>:null}
  {result?<p role="status" className="fiscal-muted">Το draft {result.created?"αποθηκεύτηκε":"υπήρχε ήδη"}.
   {" "}<Link href={"/timologio/drafts/"+encodeURIComponent(result.id)+"?organizationId="+encodeURIComponent(organizationId)}>Προβολή εγγραφής</Link>.
  </p>:null}
 </section>;
}

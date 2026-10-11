"use client";
import {useState} from "react";
import type {FiscalSandboxAccount,FiscalSandboxJournal} from "../lib/fiscal-sandbox-journal";

type EditableEntry={account:FiscalSandboxAccount;side:"debit"|"credit";amount:string};
const accounts:ReadonlyArray<{value:FiscalSandboxAccount;label:string}>=[
 {value:"cash_test",label:"Μετρητά · δοκιμή"},
 {value:"bank_test",label:"Τράπεζα · δοκιμή"},
 {value:"receivable_test",label:"Απαίτηση · δοκιμή"},
 {value:"payable_test",label:"Υποχρέωση · δοκιμή"},
 {value:"sales_test",label:"Πωλήσεις · δοκιμή"},
 {value:"purchases_test",label:"Αγορές · δοκιμή"},
 {value:"inventory_test",label:"Απόθεμα · δοκιμή"},
 {value:"adjustment_test",label:"Προσαρμογή · δοκιμή"}
];
const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
function minorFromEuro(value:string):number{
 const match=/^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(value.trim());
 if(!match)throw new Error("Χρησιμοποιήστε ποσό EUR με έως 2 δεκαδικά (π.χ. 100.00).");
 const minor=Number(match[1])*100+Number((match[2]??"").padEnd(2,"0"));
 if(minor<=0||minor>1_000_000_000)throw new Error("Το ποσό πρέπει να είναι θετικό και εντός των ορίων της δοκιμής.");
 return minor;
}
const sample:EditableEntry[]=[
 {account:"cash_test",side:"debit",amount:"100.00"},
 {account:"sales_test",side:"credit",amount:"100.00"}
];
export function FiscalJournalWorkbench({csrfToken}:{csrfToken:string}){
 const [entries,setEntries]=useState<EditableEntry[]>(sample);
 const [preview,setPreview]=useState<FiscalSandboxJournal|null>(null);
 const [error,setError]=useState("");
 const [working,setWorking]=useState(false);
 const update=(index:number,change:Partial<EditableEntry>)=>{
  setEntries(old=>old.map((entry,i)=>i===index?{...entry,...change}:entry));
  setPreview(null);setError("");
 };
 async function simulate(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(working)return;
  setWorking(true);setError("");setPreview(null);
  try{
   const payload={entries:entries.map(entry=>({
    account:entry.account,side:entry.side,amountMinor:minorFromEuro(entry.amount)
   }))};
   const response=await fetch("/timologio/api/console/journal-preview",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify(payload)
   });
   const data=await response.json() as {preview?:FiscalSandboxJournal;error?:string};
   if(!response.ok||!data.preview)
    throw new Error(data.error==="JOURNAL_NOT_BALANCED"
     ?"Οι χρεώσεις και οι πιστώσεις πρέπει να έχουν το ίδιο συνολικό ποσό."
     :data.error==="CSRF_FAILED"?"Η συνεδρία χρειάζεται ανανέωση.":data.error??"Αποτυχία υπολογισμού.");
   setPreview(data.preview);
  }catch(reason){
   setError(reason instanceof Error?reason.message:"Αποτυχία δοκιμής.");
  }finally{setWorking(false);}
 }
 return <section className="fiscal-panel fiscal-section">
  <h2>Προσομοίωση διπλογραφικής εγγραφής</h2>
  <p className="fiscal-muted">Αποκλειστικά υπολογισμός ισοσκέλισης με τεχνητούς λογαριασμούς. Δεν αποθηκεύεται εγγραφή, δεν δημιουργείται λογιστικό βιβλίο, δεν υπολογίζεται νόμιμος ΦΠΑ και δεν συνδέεται με παραστατικά.</p>
  <form onSubmit={simulate} className="fiscal-form" style={{maxWidth:"100%"}}>
   {entries.map((entry,i)=><div key={i} className="fiscal-card" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12,alignItems:"end"}}>
    <label>Δοκιμαστικός λογαριασμός
     <select value={entry.account} onChange={event=>update(i,{account:event.target.value as FiscalSandboxAccount})}>
      {accounts.map(account=><option key={account.value} value={account.value}>{account.label}</option>)}
     </select>
    </label>
    <label>Κίνηση
     <select value={entry.side} onChange={event=>update(i,{side:event.target.value as "debit"|"credit"})}>
      <option value="debit">Χρέωση</option><option value="credit">Πίστωση</option>
     </select>
    </label>
    <label>Ποσό EUR
     <input inputMode="decimal" value={entry.amount} onChange={event=>update(i,{amount:event.target.value})} required/>
    </label>
    <button type="button" className="fiscal-button secondary" disabled={entries.length<=2}
     onClick={()=>{setEntries(old=>old.filter((_,index)=>index!==i));setPreview(null);setError("");}}>
     Αφαίρεση
    </button>
   </div>)}
   <div className="fiscal-actions">
    <button type="button" className="fiscal-button secondary" disabled={entries.length>=8}
     onClick={()=>{setEntries(old=>[...old,{account:"adjustment_test",side:"debit",amount:"1.00"}]);setPreview(null);setError("");}}>Προσθήκη γραμμής</button>
    <button type="submit" className="fiscal-button" disabled={working}>{working?"Υπολογισμός...":"Έλεγχος ισοσκέλισης"}</button>
   </div>
  </form>
  {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
  {preview?<div role="status" className="fiscal-card fiscal-section">
   <h3>Ισοσκελισμένη δοκιμαστική εγγραφή</h3>
   <p>Χρεώσεις: <strong>{euro(preview.totalDebitMinor)}</strong> · Πιστώσεις: <strong>{euro(preview.totalCreditMinor)}</strong> · Διαφορά: <strong>{euro(preview.balanceMinor)}</strong></p>
   <p className="fiscal-alert">Μόνο προεπισκόπηση. Δεν έγινε καταχώριση, λογιστική αναγνώριση ή φορολογική έκδοση.</p>
  </div>:null}
 </section>;
}

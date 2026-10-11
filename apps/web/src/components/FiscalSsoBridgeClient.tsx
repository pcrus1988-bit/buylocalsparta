"use client";
import {useEffect,useRef,useState} from "react";

/**
 * FISCAL-only SSO bridge. A signed assertion arrives in the URL fragment,
 * which browsers never send in HTTP requests or Vercel authentication redirects.
 * Once the page has loaded on the protected FISCAL origin, redeem via a
 * same-origin POST. Clear the fragment before making any network requests.
 */
export function FiscalSsoBridgeClient(){
 const started=useRef(false);
 const [state,setState]=useState<"working"|"missing"|"invalid">("working");
 useEffect(()=>{
  if(started.current)return;
  started.current=true;
  const fragment=window.location.hash.startsWith("#")?
    window.location.hash.slice(1):"";
  window.history.replaceState(null,"",window.location.pathname);
  const tickets=new URLSearchParams(fragment).getAll("ticket");
  if(tickets.length!==1||!tickets[0]||tickets[0].length>2500||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(tickets[0])){
    setState("missing");return;
  }
  const assertion=tickets[0];
  void (async()=>{
   try{
    const response=await fetch("/timologio-admin/sso/callback",{
     method:"POST",credentials:"same-origin",cache:"no-store",
     headers:{"content-type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({ticket:assertion}).toString(),
     redirect:"follow"
    });
    const destination=new URL(response.url);
    if(!response.ok||destination.origin!==window.location.origin||
       destination.pathname!=="/timologio-admin")
      throw new Error("FISCAL_SSO_EXCHANGE_FAILED");
    window.location.replace("/timologio-admin");
   }catch{
    setState("invalid");
   }
  })();
 },[]);
 return <section className="fiscal-panel" style={{maxWidth:620}}>
  <h1>Ασφαλής σύνδεση FISCAL</h1>
  {state==="working"?<p role="status">Ελέγχεται η προσωρινή υπογεγραμμένη εξουσιοδότηση…</p>:
   <><p className="fiscal-alert" role="alert">
    {state==="missing"?
     "Η εξουσιοδότηση λείπει. Εάν μόλις ολοκληρώσατε την προστατευμένη σύνδεση Vercel, επιστρέψτε στο KONTA MOY και δημιουργήστε νέο κωδικό πρόσβασης.":
     "Η εξουσιοδότηση έληξε, χρησιμοποιήθηκε ή απορρίφθηκε. Επιστρέψτε στο KONTA MOY και δοκιμάστε νέα σύνδεση."}
   </p><p>Η υπογεγραμμένη εξουσιοδότηση ισχύει μόνο για 60 δευτερόλεπτα και μία χρήση.</p></>}
 </section>;
}

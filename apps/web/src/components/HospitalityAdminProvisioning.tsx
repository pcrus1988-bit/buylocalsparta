"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const messages: Record<string,string> = {
  OWNER_ACCOUNT_NOT_VERIFIED:"Ο ιδιοκτήτης πρέπει να διαθέτει ενεργό και επαληθευμένο λογαριασμό KONTA MOY.",
  PARTNER_SLUG_ALREADY_EXISTS:"Αυτός ο κωδικός συνεργάτη υπάρχει ήδη.",
  INVALID_PARTNER_SLUG:"Ο σύντομος κωδικός δέχεται λατινικά, αριθμούς και παύλες.",
  UNAUTHORIZED:"Η σύνδεση διαχειριστή έληξε ή δεν έχεις δικαίωμα.",
  HOSPITALITY_PROVISIONING_UNAVAILABLE:"Η υπηρεσία δεν είναι διαθέσιμη. Δεν έγινε επιβεβαίωση της καταχώρισης."
};

export function HospitalityAdminProvisioning({csrfToken}:{csrfToken:string}) {
  const router = useRouter();
  const [name,setName] = useState("");
  const [slug,setSlug] = useState("");
  const [ownerEmail,setOwnerEmail] = useState("");
  const [venueName,setVenueName] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);setError("");setStatus("");
    try {
      const response=await fetch("/api/admin/hospitality",{
        method:"POST",credentials:"same-origin",
        headers:{"content-type":"application/json","x-csrf-token":csrfToken},
        body:JSON.stringify({name,slug,ownerEmail,venueName})
      });
      const data=await response.json() as {error?:string;partnerId?:string;auditRecorded?:boolean};
      if (!response.ok || !data.partnerId) throw new Error(data.error??"HOSPITALITY_PROVISIONING_UNAVAILABLE");
      setStatus("Ο συνεργάτης καταχωρίστηκε με δικαιώματα ιδιοκτήτη, ενεργό DrinkStock και έναν χώρο."+
        (data.auditRecorded === false ? " Απαιτείται έλεγχος αρχείου καταγραφής." : ""));
      setName("");setSlug("");setOwnerEmail("");setVenueName("");setConfirmed(false);
      router.refresh();
    } catch(e) {
      const code=e instanceof Error?e.message:"";
      setError(messages[code]??"Δεν επιβεβαιώθηκε η καταχώριση. Έλεγξε πριν δοκιμάσεις ξανά.");
    } finally {setBusy(false)}
  }
  return <form onSubmit={submit} className="vendor-section" style={{display:"grid",gap:14,maxWidth:720}}>
    <label>Επωνυμία συνεργάτη<input required minLength={2} maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="π.χ. Sparta Hospitality Group" style={{display:"block",width:"100%",padding:12}}/></label>
    <label>Σύντομος κωδικός<input required pattern="[a-z0-9][a-z0-9-]{1,62}" maxLength={63} value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="sparta-hospitality" style={{display:"block",width:"100%",padding:12}}/></label>
    <label>Email ιδιοκτήτη (επαληθευμένος χρήστης KONTA MOY)<input required type="email" maxLength={254} value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)} placeholder="owner@example.com" autoComplete="off" style={{display:"block",width:"100%",padding:12}}/></label>
    <label>Πρώτος χώρος / κατάστημα<input required minLength={2} maxLength={200} value={venueName} onChange={e=>setVenueName(e.target.value)} placeholder="π.χ. Central Bar" style={{display:"block",width:"100%",padding:12}}/></label>
    <label style={{display:"flex",alignItems:"flex-start",gap:10}}>
      <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      <span>Επιβεβαιώνω ότι είμαι εξουσιοδοτημένος να παραχωρήσω πρόσβαση στον συγκεκριμένο χρήστη.</span>
    </label>
    <div aria-live="polite">{error && <p role="alert" style={{color:"#ac3535"}}>{error}</p>}{status && <p style={{color:"#246b45"}}>{status}</p>}</div>
    <button type="submit" className="button" disabled={busy||!confirmed}>{busy?"Καταχώριση…":"Δημιουργία συνεργάτη & DrinkStock"}</button>
  </form>;
}

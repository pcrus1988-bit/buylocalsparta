"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { normalizeGreekAfm } from "../../lib/invite-eligibility";
import s from "./interest.module.css";

const ENDPOINT="https://kontamou.site/api/mazi-interest";
type State="idle"|"sending"|"received"|"error";

export default function InterestForm(){
  const [state,setState]=useState<State>("idle");
  const [notice,setNotice]=useState("");
  const [afm,setAfm]=useState("");
  const visitor=useRef<string|null>(null);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(state==="sending"||state==="received")return;
    if(!normalizeGreekAfm(afm)){
      setNotice("Έλεγξε το 9ψήφιο ΑΦΜ της επιχείρησης.");
      setState("error");return;
    }
    const fd=new FormData(event.currentTarget);
    if(fd.get("acceptProcessing")!=="on"||fd.get("confirmAccuracy")!=="on"){
      setNotice("Χρειάζεται η ενημέρωση επεξεργασίας και η επιβεβαίωση των στοιχείων.");
      setState("error");return;
    }
    // This is an anti-abuse visitor identifier, NOT business authentication.
    // A fresh page session receives one ID; the server additionally rate-limits by network.
    if(!visitor.current)visitor.current=crypto.randomUUID().replaceAll("-","");
    setState("sending");setNotice("");
    try {
      const res=await fetch(ENDPOINT,{
        method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
        headers:{"Content-Type":"application/json","X-BLS-Visitor":visitor.current},
        body:JSON.stringify({
          afm:normalizeGreekAfm(afm),
          representativeName:String(fd.get("representativeName")||""),
          contactEmail:String(fd.get("contactEmail")||""),
          description:String(fd.get("description")||""),
          companyWebsiteCheck:String(fd.get("companyWebsiteCheck")||""),
          acceptProcessing:true,confirmAccuracy:true
        })
      });
      if(res.status===202){
        setNotice("Λάβαμε το ενδιαφέρον σου για αξιολόγηση. Η αίτηση δεν αποτελεί έγκριση ή πρόσκληση. Δεν δημιουργήθηκε λογαριασμός ούτε οικονομική υποχρέωση.");
        setState("received");return;
      }
      // Never surface whether a tax number already exists in the private queue.
      setNotice(res.status===429?
        "Έχουν γίνει πολλές προσπάθειες. Δοκίμασε ξανά αργότερα.":
        res.status===400?"Έλεγξε τα πεδία και προσπάθησε ξανά.":
        "Η αίτηση δεν ήταν δυνατό να παραληφθεί. Δοκίμασε ξανά αργότερα.");
      setState("error");
    }catch {
      setNotice("Η σύνδεση με την υπηρεσία αιτήσεων δεν ήταν διαθέσιμη. Προσπάθησε ξανά.");
      setState("error");
    }
  }
  return <div className={s.formCard}>
    <div className={s.formTop}><span>ΜΑΖΙ / INTEREST</span><strong>001</strong></div>
    <h2>Γνώρισε το <em>ΜΑΖΙ.</em></h2>
    <p className={s.formIntro}>Συμπλήρωσε τα πραγματικά στοιχεία σου. Η αίτηση πηγαίνει για έλεγχο στον ΚΟΝΤΑ ΜΟΥ Super Admin.</p>
    {state==="received"?<div className={s.success} role="status">
      <span aria-hidden="true">✓</span><h3>Το ενδιαφέρον καταχωρίστηκε.</h3><p>{notice}</p><Link href="/">Επιστροφή στην αρχική ↗</Link>
    </div>:<form className={s.form} onSubmit={submit}>
      <label htmlFor="afm">ΑΦΜ επιχείρησης <span>*</span></label>
      <input id="afm" name="afm" required inputMode="numeric" autoComplete="off"
        pattern="[0-9]{9}" minLength={9} maxLength={9} value={afm}
        onChange={e=>setAfm(e.target.value.replace(/\D/g,"").slice(0,9))}
        placeholder="9 ψηφία"/>
      <label htmlFor="representativeName">Ονοματεπώνυμο εκπροσώπου <span>*</span></label>
      <input id="representativeName" name="representativeName" required minLength={3} maxLength={120} autoComplete="name" placeholder="Ονοματεπώνυμο"/>
      <label htmlFor="contactEmail">Email επικοινωνίας <span>*</span></label>
      <input id="contactEmail" name="contactEmail" required type="email" maxLength={254} autoComplete="email" placeholder="name@business.gr"/>
      <label htmlFor="description">Λίγα λόγια για την επιχείρηση <span>*</span></label>
      <textarea id="description" name="description" required minLength={20} maxLength={1200} rows={4} placeholder="Με τι ασχολείται η επιχείρηση και τι σε ενδιαφέρει στο ΜΑΖΙ;"/>
      <div className={s.trap} aria-hidden="true"><label htmlFor="companyWebsiteCheck">Ιστότοπος (άφησέ το κενό)</label><input name="companyWebsiteCheck" id="companyWebsiteCheck" tabIndex={-1} autoComplete="off"/></div>
      <label className={s.check}><input type="checkbox" name="acceptProcessing" required/><span>Διάβασα την <Link href="/privacy" target="_blank" rel="noopener noreferrer">ενημέρωση επεξεργασίας προσωπικών δεδομένων</Link> και ζητώ αξιολόγηση της αίτησής μου.</span></label>
      <label className={s.check}><input type="checkbox" name="confirmAccuracy" required/><span>Επιβεβαιώνω ότι τα στοιχεία είναι ακριβή και ότι είμαι εξουσιοδοτημένος να επικοινωνήσω για την επιχείρηση.</span></label>
      {state==="error"?<p role="alert" className={s.error}>{notice}</p>:null}
      <button type="submit" disabled={state==="sending"} className={s.submit}>{state==="sending"?"Αποστολή σε εξέλιξη…":"Αποστολή ενδιαφέροντος"} <span aria-hidden="true">↗</span></button>
      <p className={s.footnote}>Χωρίς αυτόματη ένταξη, χρέωση ή πρόσβαση στο Ταμείο. Πρόσκληση μόνο μετά από ανεξάρτητο έλεγχο.</p>
    </form>}
  </div>;
}

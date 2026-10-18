"use client";

import {useState} from "react";
import {fiscalKybPreparationEntries,summarizeFiscalKybLocalPreparation} from "../lib/fiscal-kyb-evidence-preparation";
import type {FiscalKybCheck} from "../lib/fiscal-kyb-checks";
import type {FiscalMerchantKybRow} from "../lib/fiscal-merchant-kyb-progress";

/**
 * All check marks stay in this React component's memory and disappear on
 * navigation. No uploaded files, free text, localStorage, API, telemetry,
 * network calls or merchant evidence are collected by this component.
 */
export function FiscalKybPreparationChecklist({
 progressRows
}:{progressRows:readonly FiscalMerchantKybRow[]}){
 const [marked,setMarked]=useState<readonly FiscalKybCheck[]>([]);
 const counts=summarizeFiscalKybLocalPreparation(marked);
 const rowsById=new Map(progressRows.map(row=>[row.checkType,row]));
 return <section className="fiscal-panel fiscal-section" aria-labelledby="fiscal-preparation-heading">
  <div className="fiscal-kicker">Εργαλεία προετοιμασίας · Μόνο στη συσκευή σου</div>
  <h2 id="fiscal-preparation-heading">Προετοίμασε τα στοιχεία της επιχείρησής σου</h2>
  <p>Αυτός είναι ένας προσωπικός οδηγός οργάνωσης πριν από οποιαδήποτε
     εγκεκριμένη διαδικασία υποβολής. Τσέκαρε ποια στοιχεία έχεις
     εντοπίσει. Τα τσεκαρίσματα δεν αποθηκεύονται και δεν αποστέλλονται.</p>
  <p className="fiscal-alert" role="status">
   <strong>Δεν γίνονται δεκτά αρχεία ή δικαιολογητικά εδώ.</strong>
   {" "}Μην κοινοποιείς ταυτότητες, φορολογικά έγγραφα, υπογραφές ή προσωπικά δεδομένα
   με email, μη εγκεκριμένες συνδέσεις ή δημόσιες φόρμες. Θα χρειαστεί
   ξεχωριστό ασφαλές κανάλι όταν εγκριθεί τεχνικά και νομικά.
  </p>
  <div className="fiscal-kyb-prep-topline">
   <p aria-live="polite"><strong>{counts.locallyMarked} / {counts.total}</strong> στοιχεία
      εντοπίστηκαν από εσένα · <strong>{counts.unmarked}</strong> εκκρεμούν
      στην προσωπική σου λίστα.</p>
   <button className="fiscal-button secondary" style={{color:"#10323c"}} type="button"
    disabled={marked.length===0}
    onClick={()=>setMarked([])}>Καθαρισμός λίστας</button>
  </div>
  <div className="fiscal-kyb-prep-list">
   {fiscalKybPreparationEntries.map(item=>{
    const ready=marked.includes(item.id);
    const recorded=rowsById.get(item.id);
    return <article className="fiscal-kyb-prep-item" key={item.id}>
     <label className="fiscal-kyb-prep-check">
      <input type="checkbox" checked={ready}
       onChange={e=>setMarked(current=>e.target.checked
        ?[...current,item.id]:current.filter(id=>id!==item.id))}
       aria-describedby={"fiscal-prep-desc-"+item.id}/>
      <span><strong>{item.title}</strong>
       <small>{ready?"Το έχω εντοπίσει προσωπικά":"Δεν το έχω σημειώσει"}</small></span>
     </label>
     <p id={"fiscal-prep-desc-"+item.id}>{item.preparation}</p>
     <p className="fiscal-muted">{item.privacy}</p>
     <small>Κατάσταση εσωτερικού ελέγχου: {recorded?.stageLabel??"Δεν έχει επαληθευτεί"}</small>
    </article>;
   })}
  </div>
  <p className="fiscal-muted">Η λίστα διαγράφεται όταν κλείσεις ή ανανεώσεις αυτή τη σελίδα.
   Δεν υποβάλλει αίτηση, δεν αποδεικνύει ταυτότητα ή εκπροσώπηση και
   δεν ενημερώνει τον χειριστή FISCAL. Η επίσημη έκδοση παραμένει ανενεργή.</p>
 </section>;
}

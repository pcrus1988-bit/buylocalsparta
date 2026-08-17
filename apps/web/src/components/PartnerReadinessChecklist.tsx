"use client";

import Link from "next/link";
import { useState } from "react";

const items = [
  ["business", "Νόμιμη και ενεργή επιχείρηση", "Έχω διαθέσιμα τα εταιρικά και φορολογικά στοιχεία που χρειάζονται για KYB."],
  ["location", "Τοπική παρουσία ή επιλέξιμη περιοχή", "Το κατάστημα ή η δηλωμένη περιοχή εξυπηρέτησης καλύπτει το πιλοτικό πεδίο της Σπάρτης."],
  ["catalog", "Κατάλογος και stock", "Μπορώ να διαθέσω αναγνωρίσιμα προϊόντα, supplier prices και πραγματικές ποσότητες."],
  ["rights", "Δικαιώματα περιεχομένου", "Γνωρίζω ποιος κατέχει τις φωτογραφίες και μπορώ να τεκμηριώσω δικαίωμα χρήσης."],
  ["compliance", "Συμμόρφωση προϊόντων", "Μπορώ να προσκομίσω τα απαιτούμενα έγγραφα για τις σχετικές κατηγορίες."],
  ["operations", "Υπεύθυνος λειτουργίας", "Υπάρχει άνθρωπος που θα διαχειρίζεται παραγγελίες, επιστροφές και ενημέρωση stock."]
] as const;

export function PartnerReadinessChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const completed = items.filter(([id]) => checked[id]).length;
  const percentage = Math.round((completed / items.length) * 100);
  return <section className="shell content-section readiness-tool" aria-labelledby="readiness-title">
    <div className="content-heading"><div><div className="eyebrow">Self-check</div><h2 id="readiness-title">Έλεγξε την επιχειρησιακή ετοιμότητα.</h2></div><p>Η λίστα δεν αποτελεί έγκριση. Σε βοηθά να εντοπίσεις τι λείπει πριν από τον ελεγχόμενο κύκλο onboarding.</p></div>
    <div className="readiness-layout"><div className="readiness-list">{items.map(([id, title, description]) => <label key={id} className={checked[id] ? "is-checked" : undefined}><input type="checkbox" checked={Boolean(checked[id])} onChange={(event) => setChecked((current) => ({ ...current, [id]: event.target.checked }))} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div><aside><span>Readiness</span><strong>{percentage}%</strong><div className="readiness-meter"><i style={{ width: `${percentage}%` }} /></div><p>{completed === items.length ? "Έχεις συγκεντρώσει τις βασικές προϋποθέσεις για να περάσεις στον επίσημο έλεγχο." : `${items.length - completed} σημεία χρειάζονται ακόμη επιβεβαίωση.`}</p><Link className="button" href="/join">Δες τα στάδια onboarding</Link><Link className="text-link" href="/vendor/login">Ήδη εγκεκριμένος; Σύνδεση →</Link></aside></div>
  </section>;
}

"use client";

import { useState } from "react";

type Concern = "break" | "peel" | "dry" | "soft";
type Context = "water" | "manicure" | "daily" | "unknown";
type Routine = { title: string; short: string; steps: string[]; watch: string };
const concerns: { id: Concern; symbol: string; label: string; description: string }[] = [
  { id: "break", symbol: "◇", label: "Σπάνε εύκολα", description: "Μικρά σπασίματα στην άκρη" },
  { id: "peel", symbol: "≋", label: "Ξεφλουδίζουν", description: "Οι στρώσεις φαίνονται να χωρίζουν" },
  { id: "dry", symbol: "✳", label: "Ξηρά επωνύχια", description: "Τραβήγματα ή ξηρό δέρμα" },
  { id: "soft", symbol: "○", label: "Εύκαμπτα νύχια", description: "Νιώθουν λεπτά ή αδύναμα" },
];
const contexts: { id: Context; title: string; detail: string }[] = [
  { id: "water", title: "Νερό & καθαρισμός", detail: "Συχνό πλύσιμο, απορρυπαντικά" },
  { id: "manicure", title: "Μανικιούρ & αφαίρεση", detail: "Gel, αφαίρεση, λιμάρισμα" },
  { id: "daily", title: "Καθημερινή καταπόνηση", detail: "Πληκτρολόγηση, δουλειές, πίεση" },
  { id: "unknown", title: "Δεν είμαι σίγουρη/ος", detail: "Δεν χρειάζεται να γνωρίζεις την αιτία" },
];
const base: Record<Concern, Routine> = {
  break: { title: "Απαλή φροντίδα για εύθραυστα νύχια", short: "Στόχος: λιγότερη μηχανική καταπόνηση.", steps: ["Κράτησε ένα πρακτικό μήκος ώστε να περιορίσεις τα χτυπήματα στις άκρες.", "Λίμαρε ήπια, χωρίς έντονο τρίψιμο ή επιθετική αφαίρεση.", "Ακολούθησε σταθερά μια ήπια ρουτίνα ενυδάτωσης της περιοχής γύρω από τα νύχια."], watch: "Αν το σπάσιμο εμφανιστεί ξαφνικά, είναι επίμονο ή συνοδεύεται από πόνο, χρειάζεται επαγγελματική αξιολόγηση." },
  peel: { title: "Φροντίδα για νύχια που ξεφλουδίζουν", short: "Στόχος: να μην αφαιρείς με δύναμη τις επιφανειακές στρώσεις.", steps: ["Μην τραβάς το gel ή άλλες επιστρώσεις για να τις αφαιρέσεις.", "Απόφυγε έντονο γυάλισμα ή επαναλαμβανόμενο λιμάρισμα της πλάκας.", "Δώσε προσοχή σε ήπια αφαίρεση και στην καθημερινή προστασία των χεριών."], watch: "Επίμονες ή μεγάλες αλλαγές στην επιφάνεια των νυχιών αξίζουν αξιολόγηση από επαγγελματία υγείας." },
  dry: { title: "Μικρές κινήσεις για τα επωνύχια", short: "Στόχος: άνεση και προσεκτική προστασία της επιδερμίδας.", steps: ["Ενυδάτωνε απαλά την επιδερμίδα γύρω από τα νύχια, ιδίως μετά το πλύσιμο.", "Μην κόβεις, μην τραβάς και μην πειράζεις ερεθισμένο δέρμα.", "Προστάτευσε τα χέρια από παρατεταμένη επαφή με ερεθιστικά καθαριστικά."], watch: "Ερυθρότητα που εξαπλώνεται, πρήξιμο, έντονη ευαισθησία ή εκροή χρειάζονται επαγγελματική αξιολόγηση." },
  soft: { title: "Ήπια ρουτίνα για εύκαμπτα νύχια", short: "Στόχος: καθημερινή προστασία, χωρίς επιθετικές τεχνικές.", steps: ["Κράτησε τα νύχια σε μήκος που να μη λυγίζουν εύκολα στις δραστηριότητές σου.", "Προτίμησε ήπιες διαδικασίες μανικιούρ, αποφεύγοντας τραυματισμούς.", "Παρατήρησε αλλαγές με την πάροδο του χρόνου χωρίς να δοκιμάζεις πολλές παρεμβάσεις ταυτόχρονα."], watch: "Αν τα νύχια αλλάζουν ξαφνικά ή σε απασχολούν επίμονα, απευθύνσου σε επαγγελματία υγείας." },
};
const contextHints: Record<Context, string> = {
  water: "Όταν χρειάζεται παρατεταμένος καθαρισμός, τα κατάλληλα γάντια μπορούν να μειώσουν την άμεση επαφή με νερό και καθαριστικά.",
  manicure: "Σκέψου ένα διάλειμμα από επιθετικές τεχνικές και ζήτησε από επαγγελματία τεχνίτη ήπια αφαίρεση, χωρίς τραυματισμό.",
  daily: "Δοκίμασε μικρές προσαρμογές στις καθημερινές κινήσεις ώστε τα νύχια να μη χρησιμοποιούνται ως εργαλεία.",
  unknown: "Δεν χρειάζεται να εντοπίσεις μια αιτία για να ξεκινήσεις απλές, ήπιες συνήθειες φροντίδας.",
};
const warningSigns = ["Πόνος, πρήξιμο ή ζέστη γύρω από το νύχι", "Έκκριση, αιμορραγία ή σημαντική αποκόλληση", "Νέα σκούρα γραμμή ή επίμονη αλλαγή χρώματος"];
export default function GuidedCare() {
  const [step, setStep] = useState(0);
  const [concern, setConcern] = useState<Concern | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [warning, setWarning] = useState<boolean | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const plan = concern ? base[concern] : null;
  const reset = () => { setStep(0); setConcern(null); setContext(null); setWarning(null); setDone([]); };
  return <section className="panel journey" aria-labelledby="journey-title">
    <div className="journey-top"><div><span className="overline">THE CARE EDIT / 02</span><h2 id="journey-title">Η φροντίδα, <em>προσωπική υπόθεση.</em></h2>
      <p className="muted journey-lead">Τρεις μικρές ερωτήσεις για μια απαλή ρουτίνα φροντίδας. Χωρίς διάγνωση, υπερβολές ή υποσχέσεις προϊόντων.</p></div>
      <div className="journey-meter"><span>{step === 3 ? "Ο οδηγός σου" : "Βήμα " + (step + 1) + " από 3"}</span><div className="meter-track"><div style={{ width: (Math.min(step + 1, 3) / 3 * 100) + "%" }} /></div></div>
    </div>
    <div className="journey-card">
      {step === 0 && <><span className="overline">01 / WHAT'S ON YOUR MIND</span><h3>Τι θα ήθελες να φροντίσεις;</h3><p className="muted">Διάλεξε αυτό που σε απασχολεί περισσότερο αυτή την περίοδο.</p>
        <div className="concern-grid">{concerns.map(item => <button className={"concern-option" + (concern === item.id ? " picked" : "")} key={item.id} type="button" aria-pressed={concern === item.id} onClick={() => setConcern(item.id)}><span className="concern-symbol" aria-hidden="true">{item.symbol}</span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
        <div className="journey-actions"><button className="primary-action" type="button" disabled={!concern} onClick={() => setStep(1)}>Συνέχεια <span aria-hidden="true">→</span></button></div></>}
      {step === 1 && <><span className="overline">02 / YOUR EVERYDAY</span><h3>Πότε το παρατηρείς περισσότερο;</h3><p className="muted">Η απάντηση βοηθά να επιλέξουμε πιο πρακτικές συνήθειες.</p>
        <div className="context-list">{contexts.map(item => <button type="button" className={"context-option" + (context === item.id ? " picked" : "")} aria-pressed={context === item.id} key={item.id} onClick={() => setContext(item.id)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="selection-circle" aria-hidden="true">{context === item.id ? "✓" : ""}</span></button>)}</div>
        <div className="journey-actions"><button className="back-action" type="button" onClick={() => setStep(0)}>← Πίσω</button><button className="primary-action" type="button" disabled={!context} onClick={() => setStep(2)}>Συνέχεια →</button></div></>}
      {step === 2 && <><span className="overline">03 / YOUR WELLBEING</span><h3>Έχεις παρατηρήσει κάποιο από αυτά;</h3><ul className="warning-signs">{warningSigns.map(item => <li key={item}><span aria-hidden="true">!</span>{item}</li>)}</ul><p className="muted">Δεν χρειάζεται να μοιραστείς προσωπικές λεπτομέρειες. Αρκεί να επιλέξεις.</p>
        <div className="warning-choices"><button className={warning === false ? "picked" : ""} type="button" aria-pressed={warning === false} onClick={() => setWarning(false)}>Όχι, τίποτα από αυτά</button><button className={warning === true ? "picked" : ""} type="button" aria-pressed={warning === true} onClick={() => setWarning(true)}>Ναι ή δεν είμαι σίγουρη/ος</button></div>
        <div className="journey-actions"><button className="back-action" type="button" onClick={() => setStep(1)}>← Πίσω</button><button className="primary-action" type="button" disabled={warning === null} onClick={() => setStep(3)}>Δες την καθοδήγηση →</button></div></>}
      {step === 3 && plan && <><span className="overline">YOUR GENTLE CARE GUIDE</span><h3>{warning ? "Πρώτα, η φροντίδα της υγείας σου." : plan.title}</h3><p className="muted">{warning ? "Ορισμένες αλλαγές χρειάζονται εξέταση, όχι online εκτίμηση." : plan.short}</p>
        {warning ? <div className="care-alert" role="status"><strong>Ζήτησε αξιολόγηση από επαγγελματία υγείας.</strong><p>Μην προσπαθήσεις να θεραπεύσεις την περιοχή με DIY διαδικασίες, προϊόντα ή επιθετικό μανικιούρ. Αν η κατάσταση είναι έντονη ή επιδεινώνεται, ζήτησε έγκαιρα βοήθεια.</p></div>
          : <><p className="context-hint">{context && contextHints[context]}</p><div className="routine-list">{plan.steps.map((tip, index) => <button className={"routine-step" + (done.includes(index) ? " completed" : "")} key={tip} type="button" aria-pressed={done.includes(index)} onClick={() => setDone(prev => prev.includes(index) ? prev.filter(n => n !== index) : [...prev, index])}><span className="routine-check">{done.includes(index) ? "✓" : String(index + 1).padStart(2, "0")}</span><span>{tip}</span></button>)}</div><p className="care-watch">{plan.watch}</p></>}
        <div className="journey-actions"><button className="back-action" type="button" onClick={() => setStep(2)}>← Πίσω</button><button className="primary-action" type="button" onClick={reset}>Ξεκίνα ξανά ↗</button></div></>}
    </div>
    <p className="care-ethics">NYXI CARE NOTE · Οι πληροφορίες είναι γενικές και δεν υποκαθιστούν την ιατρική διάγνωση ή θεραπεία. Δεν προτείνουμε θεραπεία ή συγκεκριμένο προϊόν χωρίς τεκμηρίωση.</p>
  </section>;
}

"use client";

import { useState, type FormEvent } from "react";
import PhotoColorStudio from "./photo-color-studio";

type Result = { id: string; type: string; excerpt: string; citation_url: string; authority: string | null; category: string | null };
type SearchReply = { status?: string; results?: Result[]; error?: string };
type Tab = "color" | "search" | "care";

const care = [
  { name: "Εύθραυστα νύχια", subtitle: "Όταν τα νύχια σπάνε εύκολα", tips: ["Προτίμησε ήπια περιποίηση και περιόρισε το έντονο λιμάρισμα.", "Προστάτευσε τα χέρια κατά την παρατεταμένη επαφή με νερό."] },
  { name: "Ξεφλούδισμα", subtitle: "Όταν οι στρώσεις του νυχιού διαχωρίζονται", tips: ["Μην αφαιρείς επιστρώσεις τραβώντας τες με δύναμη.", "Περιόρισε την καταπόνηση κατά την αφαίρεση προϊόντων."] },
  { name: "Ξηρά επωνύχια", subtitle: "Όταν η περιοχή γύρω από το νύχι χρειάζεται φροντίδα", tips: ["Ενυδάτωνε απαλά την επιδερμίδα γύρω από τα νύχια.", "Μην κόβεις ή τραβάς ερεθισμένο δέρμα."] },
  { name: "Αδύναμα νύχια", subtitle: "Για πιο ήπιες καθημερινές συνήθειες", tips: ["Κράτησε πρακτικό μήκος και απόφυγε μηχανική πίεση.", "Δώσε προτεραιότητα στην ήπια αφαίρεση επιστρώσεων."] }
];

const tabLabels: { value: Tab; number: string; label: string }[] = [
  { value: "color", number: "01", label: "Color Studio" },
  { value: "care", number: "02", label: "Nail Problem Solver" },
  { value: "search", number: "03", label: "Έρευνα & πηγές" }
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("color");
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchReply>({});
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setData({});
    try {
      const r = await fetch("/api/search?q=" + encodeURIComponent(q.trim()), { cache: "no-store" });
      const payload = await r.json() as SearchReply;
      setData(r.ok ? payload : { error: r.status === 429 ? "Πολλά αιτήματα. Δοκίμασε ξανά αργότερα." : "Η αναζήτηση δεν είναι διαθέσιμη.", results: [] });
    } catch {
      setData({ error: "Αποτυχία σύνδεσης. Δοκίμασε ξανά.", results: [] });
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="header">
      <a className="logo" href="/" aria-label="NYXI — Αρχική">NYXI<span className="dot">.</span></a>
      <div className="header-right"><span className="tag">NAIL INTELLIGENCE</span><span className="beta-label">BETA</span></div>
    </header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="eyebrow"><span className="eyebrow-mark" aria-hidden="true">✳</span> THE NAIL EXPERIENCE</span>
        <h1 id="hero-title">Η ομορφιά<br />έχει <em>απόχρωση.</em></h1>
        <p>Ανακάλυψε τα χρώματα που σε εμπνέουν, εξερεύνησε ήπιες συνήθειες φροντίδας και αναζήτησε τεκμηριωμένη γνώση. Όλα σε ένα μέρος, φτιαγμένο για τα νύχια σου.</p>
        <button type="button" className="hero-cta" onClick={() => { setTab("color"); document.getElementById("nyxi-tools")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Ξεκίνα με το χρώμα <span aria-hidden="true">↗</span></button>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-orbit orbit-three" /><span className="art-word">color is personal.</span><div className="art-caption">NYXI / YOUR SHADE</div></div>
    </section>

    <div className="intro-line"><span>DISCOVER · CARE · LEARN</span><span>Μια νέα εμπειρία ομορφιάς</span></div>

    <section id="nyxi-tools" className="tools" aria-label="Εργαλεία NYXI">
      <nav className="tabs" aria-label="Επιλογή εργαλείου">
        {tabLabels.map((item) => <button key={item.value} type="button" className={tab === item.value ? "active" : ""} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
          <small>{item.number}</small><span>{item.label}</span><span className="tab-arrow" aria-hidden="true">↗</span>
        </button>)}
      </nav>

      {tab === "color" && <PhotoColorStudio />}

      {tab === "search" && <section className="panel" aria-labelledby="search-title">
        <span className="overline">03 / KNOWLEDGE LIBRARY</span>
        <h2 id="search-title">Γνώση που μπορείς να ελέγξεις.</h2>
        <p className="muted search-intro">Εξερεύνησε πληροφορίες για συστατικά, προϊόντα και περιποίηση. Εμφανίζονται μόνο στοιχεία με ανεξάρτητα εγκεκριμένη τεκμηρίωση.</p>
        <form className="searchform" onSubmit={submit}>
          <label htmlFor="query" className="sr-only">Όρος αναζήτησης</label>
          <input id="query" value={q} maxLength={100} disabled={busy} onChange={e => setQ(e.target.value)} placeholder="π.χ. INCI, gel polish, συστατικά" />
          <button type="submit" disabled={busy || !q.trim()}>{busy ? "Αναζήτηση…" : "Αναζήτηση"} <span aria-hidden="true">↗</span></button>
        </form>
        <div className="results" aria-live="polite" aria-busy={busy}>
          {busy && <p className="notice">Γίνεται αναζήτηση στις εγκεκριμένες πηγές…</p>}
          {data.error && <p className="notice warning" role="alert">{data.error}</p>}
          {data.status === "no_approved_evidence" && <p className="notice">Η βιβλιοθήκη βρίσκεται υπό έλεγχο. Δεν υπάρχουν ακόμη εγκεκριμένα στοιχεία προς δημοσίευση.</p>}
          {data.status === "no_matches" && <p className="notice">Δεν βρέθηκαν εγκεκριμένα αποτελέσματα.</p>}
          {data.results?.map(x => <article className="result" key={x.id}><div className="resultmeta">{x.authority || "Πρωτογενής πηγή"}{x.category ? " · " + x.category : ""}</div><p>{x.excerpt}</p><a href={x.citation_url} target="_blank" rel="noopener noreferrer">Δες την πηγή <span aria-hidden="true">↗</span></a></article>)}
        </div>
        <p className="source-note">Η NYXI δεν δημοσιεύει ανεπιβεβαίωτα ευρήματα. Το περιεχόμενο προστίθεται σταδιακά μετά από έλεγχο.</p>
      </section>}

      {tab === "care" && <section className="panel care-panel" aria-labelledby="care-title">
        <span className="overline">02 / NAIL CARE</span>
        <h2 id="care-title">Η φροντίδα αρχίζει<br /><em>με τη σωστή ερώτηση.</em></h2>
        <p className="muted">Τι σε απασχολεί περισσότερο; Επίλεξε ένα θέμα για γενικές προτάσεις ήπιας περιποίησης. Δεν πρόκειται για διάγνωση ή θεραπεία.</p>
        <div className="care-layout">
          <div className="choices" role="group" aria-label="Θέματα περιποίησης">
            {care.map((x, i) => <button type="button" key={x.name} className={selected === i ? "chosen" : ""} aria-pressed={selected === i} onClick={() => setSelected(i)}>
              <span>{String(i + 1).padStart(2, "0")}</span><strong>{x.name}</strong><span aria-hidden="true">↗</span>
            </button>)}
          </div>
          <div className="carecard" aria-live="polite">
            <span className="overline">GENTLE CARE GUIDE</span><h3>{care[selected].name}</h3><p className="care-subtitle">{care[selected].subtitle}</p>
            <ul>{care[selected].tips.map(x => <li key={x}>{x}</li>)}</ul>
            <p className="disclaimer">Αν υπάρχει πόνος, πρήξιμο, φλεγμονή ή επίμονη αλλαγή, απευθύνσου σε επαγγελματία υγείας. Δεν προτείνουμε θεραπεία ή συγκεκριμένο προϊόν χωρίς τεκμηρίωση.</p>
          </div>
        </div>
      </section>}
    </section>

    <footer><div><a className="footer-brand" href="/">NYXI<span className="dot">.</span></a><p>Η δική σου εμπειρία νυχιών.</p></div><div className="footer-meta"><span>Ερευνητική έκδοση · BETA</span><span>Οι πληροφορίες δεν αντικαθιστούν επαγγελματική συμβουλή.</span></div></footer>
  </main>;
}

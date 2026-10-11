"use client";

import { useState, type FormEvent } from "react";

type Result = {
  id: string;
  type: string;
  authority: string | null;
  jurisdiction: string | null;
  category: string | null;
  excerpt: string;
  citation_url: string;
};
type SearchResponse = {
  status?: "idle" | "ok" | "no_matches" | "no_approved_evidence";
  query?: string;
  results?: Result[];
  error?: string;
};

const problems = [
  { id: "fragile", label: "Εύθραυστα νύχια", title: "Ήπια προστασία", tips: ["Περιόρισε τις επαναλαμβανόμενες καταπονήσεις και την παρατεταμένη επαφή με νερό.", "Προτίμησε ήπια περιποίηση και απόφυγε το έντονο λιμάρισμα.", "Αν η αλλαγή επιμένει ή συνοδεύεται από πόνο, συμβουλεύσου επαγγελματία υγείας."] },
  { id: "peeling", label: "Ξεφλούδισμα", title: "Μείωση καταπόνησης", tips: ["Μην αποκολλάς στρώσεις του νυχιού ή επιστρώσεις με δύναμη.", "Προστάτευε τα χέρια κατά τις εργασίες με απορρυπαντικά.", "Για επίμονη ή ασυνήθιστη αλλοίωση, ζήτησε αξιολόγηση από επαγγελματία υγείας."] },
  { id: "cuticles", label: "Ξηρά επωνύχια", title: "Φροντίδα της περιοχής", tips: ["Δοκίμασε απλή ενυδάτωση της γύρω επιδερμίδας.", "Απόφυγε να κόβεις ή να τραβάς ερεθισμένο δέρμα.", "Αν υπάρχει ερυθρότητα, πρήξιμο ή πόνος, ζήτησε ιατρική συμβουλή."] },
  { id: "weak", label: "Αδύναμα νύχια", title: "Σταδιακή φροντίδα", tips: ["Περιόρισε επιθετικές διαδικασίες αφαίρεσης προϊόντων.", "Κράτησε τα νύχια σε πρακτικό μήκος, χωρίς έντονη μηχανική πίεση.", "Οι επίμονες αλλαγές χρειάζονται επαγγελματική αξιολόγηση, όχι αυτοδιάγνωση."] },
] as const;

export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchResponse>({ status: "idle", results: [] });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<(typeof problems)[number]["id"]>("fragile");
  const [tab, setTab] = useState<"search" | "care">("search");
  const problem = problems.find((p) => p.id === selected) ?? problems[0];

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q) { setStatus({ status: "idle", results: [] }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/search?q=" + encodeURIComponent(q), { cache: "no-store" });
      const data = await res.json() as SearchResponse;
      setStatus(res.ok ? data : { error: res.status === 429 ? "Πολλά αιτήματα. Δοκίμασε ξανά αργότερα." : "Η τεκμηριωμένη αναζήτηση δεν είναι προσωρινά διαθέσιμη.", results: [] });
    } catch {
      setStatus({ error: "Η σύνδεση απέτυχε. Δοκίμασε ξανά.", results: [] });
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="header"><a href="/" className="logo" aria-label="NYXI αρχική">NYXI<span className="dot">.</span></a><span className="tag">NAIL INTELLIGENCE · BETA</span></header>
    <section className="hero"><div className="eyebrow">Η γνώση πίσω από το χρώμα</div><h1>Τα νύχια σου.<br/><em>Η δική σου επιλογή.</em></h1><p>Ανακάλυψε τεκμηριωμένες πληροφορίες για προϊόντα, συστατικά και περιποίηση. Κάθε δημοσιευμένη πληροφορία συνοδεύεται από πηγή.</p></section>
    <nav className="tabs" aria-label="Επιλογή εργαλείου"><button type="button" className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Αναζήτηση γνώσης</button><button type="button" className={tab === "care" ? "active" : ""} onClick={() => setTab("care")}>Nail Problem Solver</button></nav>
    {tab === "search" ? <section className="panel" aria-labelledby="search-title">
      <h2 id="search-title">Τι θέλεις να μάθεις;</h2><p className="muted">Αναζήτησε συστατικό, προϊόν ή θέμα περιποίησης.</p>
      <form onSubmit={search} className="searchform"><label className="sr-only" htmlFor="query">Όρος αναζήτησης</label><input id="query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="π.χ. INCI, gel polish, acrylates" maxLength={100} autoComplete="off"/><button disabled={busy} type="submit">{busy ? "Αναζήτηση…" : "Αναζήτηση"}</button></form>
      <div className="results" aria-live="polite" aria-busy={busy}>
        {status.error && <p className="notice warning">{status.error}</p>}
        {status.status === "no_approved_evidence" && <p className="notice">Η βιβλιοθήκη τεκμηρίωσης βρίσκεται σε ανεξάρτητο έλεγχο. Δεν υπάρχουν ακόμη εγκεκριμένες πληροφορίες προς δημοσίευση.</p>}
        {status.status === "no_matches" && <p className="notice">Δεν βρέθηκαν εγκεκριμένα αποτελέσματα για αυτή την αναζήτηση.</p>}
        {status.results?.map((r) => <article className="result" key={r.id}><div className="resultmeta">{r.authority || "Τεκμηριωμένη πηγή"}{r.category ? " · " + r.category : ""}</div><p>{r.excerpt}</p><a href={r.citation_url} target="_blank" rel="noopener noreferrer">Δες την πρωτογενή πηγή ↗</a></article>)}
      </div>
    </section> : <section className="panel" aria-labelledby="care-title">
      <h2 id="care-title">Πώς αισθάνονται τα νύχια σου;</h2><p className="muted">Διάλεξε το θέμα που σε απασχολεί για γενικές οδηγίες φροντίδας.</p>
      <div className="choices" role="group" aria-label="Επιλογή θέματος">{problems.map((p) => <button key={p.id} type="button" className={selected === p.id ? "chosen" : ""} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>{p.label}</button>)}</div>
      <div className="carecard"><span className="eyebrow">ΓΕΝΙΚΕΣ ΣΥΜΒΟΥΛΕΣ</span><h3>{problem.title}</h3><ul>{problem.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul><p className="disclaimer">Το NYXI δεν παρέχει διάγνωση, θεραπεία ή αξιολόγηση ασφάλειας συγκεκριμένου προϊόντος.</p></div>
    </section>}
    <footer><span>NYXI · Έρευνα με πηγές και ανθρώπινο έλεγχο</span><span>Πληροφοριακό εργαλείο · Δεν αντικαθιστά ιατρική συμβουλή</span></footer>
  </main>;
}

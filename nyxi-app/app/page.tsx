"use client";

import { useState, type FormEvent } from "react";
import PhotoColorStudio from "./photo-color-studio";
import GuidedCare from "./guided-care";
import NailStyleStudio from "./nail-style-studio";

type Result = { id: string; type: string; excerpt: string; citation_url: string; authority: string | null; category: string | null };
type SearchReply = { status?: string; results?: Result[]; error?: string };
type Tab = "color" | "care" | "style" | "search";

const tabLabels: { value: Tab; number: string; label: string }[] = [
  { value: "color", number: "01", label: "Color Studio" },
  { value: "care", number: "02", label: "Nail Problem Solver" },
  { value: "style", number: "03", label: "Nail Atelier" },
  { value: "search", number: "04", label: "Γνώση & πηγές" }
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("color");
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchReply>({});
  const [busy, setBusy] = useState(false);
  const [sampledShade, setSampledShade] = useState<string | null>(null);
  const searchEnabled = process.env.NEXT_PUBLIC_NYXI_SEARCH_ENABLED === "true";

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
        <p>Βρες το χρώμα σου, σχεδίασε το επόμενο μανικιούρ και φρόντισε τα νύχια σου με ήπιες, πρακτικές συμβουλές. Μια προσωπική εμπειρία ομορφιάς με τη γνώση στο πλευρό σου.</p>
        <button type="button" className="hero-cta" onClick={() => { setTab("color"); document.getElementById("nyxi-tools")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Ξεκίνα με το χρώμα <span aria-hidden="true">↗</span></button>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-orbit orbit-three" /><span className="art-word">color is personal.</span><div className="art-caption">NYXI / YOUR SHADE</div></div>
    </section>

    <div className="intro-line"><span>COLOR · CARE · CREATE · LEARN</span><span>Το δικό σου nail ritual</span></div>

    <section id="nyxi-tools" className="tools" aria-label="Εργαλεία NYXI">
      <nav className="tabs" aria-label="Επιλογή εργαλείου">
        {tabLabels.map((item) => <button key={item.value} type="button" className={tab === item.value ? "active" : ""} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
          <small>{item.number}</small><span>{item.label}</span><span className="tab-arrow" aria-hidden="true">↗</span>
        </button>)}
      </nav>

      <div hidden={tab !== "color"}><PhotoColorStudio onColorPick={setSampledShade} /></div>

      <div hidden={tab !== "style"}><NailStyleStudio sampledShade={sampledShade} active={tab === "style"} /></div>

      <div hidden={tab !== "search"}><section className="panel" aria-labelledby="search-title">
        <span className="overline">04 / KNOWLEDGE LIBRARY</span>
        <h2 id="search-title">Γνώση που μπορείς να ελέγξεις.</h2>
        <p className="muted search-intro">Εξερεύνησε πληροφορίες για συστατικά, προϊόντα και περιποίηση. Εμφανίζονται μόνο στοιχεία με ανεξάρτητα εγκεκριμένη τεκμηρίωση.</p>
        {searchEnabled ? <>
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
        </> : <div className="research-holding" role="status"><div className="holding-mark" aria-hidden="true">✧</div><span className="overline">QUALITY FIRST</span><h3>Η βιβλιοθήκη προετοιμάζεται με προσοχή.</h3><p>Ελέγχουμε κάθε πηγή ανεξάρτητα πριν εμφανιστεί εδώ. Στο μεταξύ, μπορείς να εξερευνήσεις το Color Studio, να σχεδιάσεις το μανικιούρ σου ή να δεις τον οδηγό ήπιας φροντίδας.</p><button type="button" className="primary-action" onClick={() => setTab("care")}>Εξερεύνησε το Nail Care <span aria-hidden="true">↗</span></button></div>}
        <p className="source-note">Η NYXI δεν δημοσιεύει ανεπιβεβαίωτα ευρήματα. Το περιεχόμενο προστίθεται σταδιακά μετά από έλεγχο.</p>
      </section></div>

      <div hidden={tab !== "care"}><GuidedCare /></div>

    </section>

    <footer><div><a className="footer-brand" href="/">NYXI<span className="dot">.</span></a><p>Η δική σου εμπειρία νυχιών.</p></div><div className="footer-meta"><span>Ερευνητική έκδοση · BETA</span><span>Οι πληροφορίες δεν αντικαθιστούν επαγγελματική συμβουλή.</span></div></footer>
  </main>;
}

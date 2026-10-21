"use client";

import { useState, type FormEvent } from "react";
import PhotoColorStudio from "./photo-color-studio";
import GuidedCare from "./guided-care";
import NailStyleStudio from "./nail-style-studio";
import PublicSourceAtlas from "./public-source-atlas";
import PremiumHero from "./premium-hero";

type Result = { id: string; type: string; excerpt: string; citation_url: string; authority: string | null; category: string | null };
type SearchReply = { status?: string; results?: Result[]; error?: string };
type Tab = "color" | "care" | "style" | "search";

const tabLabels: { value: Tab; number: string; label: string; description: string }[] = [
  { value: "color", number: "01", label: "Color Studio", description: "Ανακάλυψε την απόχρωσή σου" },
  { value: "care", number: "02", label: "Nail Care", description: "Μια πιο προσωπική ρουτίνα" },
  { value: "style", number: "03", label: "Nail Atelier", description: "Σχεδίασε το επόμενο look" },
  { value: "search", number: "04", label: "Γνώση & πηγές", description: "Η γνώση πίσω από την ομορφιά" }
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

  const selected = tabLabels.find(item => item.value === tab) ?? tabLabels[0];

  return <main className="shell nyxi-rebuild">
    <a className="nyxi-skip-link" href="#nyxi-tools">Μετάβαση στο studio</a>
    <header className="header nyxi-main-header">
      <a className="logo" href="/" aria-label="NYXI — Αρχική">NYXI<span className="dot">.</span></a>
      <span className="nyxi-head-manifesto">YOUR HANDS. YOUR STORY.</span>
      <div className="header-right"><a className="header-link" href="#nyxi-tools">THE STUDIO <span aria-hidden="true">↗</span></a><span className="beta-label">BETA</span></div>
    </header>

    <PremiumHero onOpen={destination => {
      setTab(destination);
      document.getElementById("nyxi-tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }} />

    <div className="nyxi-editorial-ticker" aria-label="NYXI philosophy">
      <span>01 — DISCOVER</span><span aria-hidden="true">✦</span><span>02 — CARE</span><span aria-hidden="true">✦</span><span>03 — CREATE</span><span aria-hidden="true">✦</span><span>04 — LEARN</span>
    </div>

    <section id="nyxi-tools" className="tools nyxi-experience" aria-label="Εργαλεία NYXI">
      <div className="nyxi-experience-intro">
        <span className="nyxi-eyebrow">NYXI / INTERACTIVE BEAUTY STUDIO</span>
        <div className="nyxi-experience-intro-bottom">
          <h2>Όλα αρχίζουν<br /><em>από εσένα.</em></h2>
          <p>Όχι άλλος ένας κατάλογος ομορφιάς. Ένας χώρος για να ανακαλύψεις, να δοκιμάσεις και να δημιουργήσεις — στον δικό σου ρυθμό.</p>
        </div>
      </div>
      <div className="nyxi-workspace">
        <nav className="tabs nyxi-chapter-nav" aria-label="Επιλογή εργαλείου">
          <div className="nyxi-nav-top"><span>EXPLORE / 01—04</span><span>↘</span></div>
          {tabLabels.map((item) => <button key={item.value} type="button" className={tab === item.value ? "active" : ""} aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
            <small>{item.number}</small><span>{item.label}</span><span className="tab-description">{item.description}</span><span className="tab-arrow" aria-hidden="true">↗</span>
          </button>)}
          <div className="nyxi-nav-footer">A LITTLE DIFFERENT. A LITTLE YOU.</div>
        </nav>
        <div className={"nyxi-workspace-content nyxi-space-" + tab}>
          <div className="nyxi-workspace-topline"><span>NOW EXPLORING — {selected.number}</span><span>{selected.label.toUpperCase()}</span></div>
          <div hidden={tab !== "color"}><PhotoColorStudio onColorPick={setSampledShade} /></div>
          <div hidden={tab !== "style"}><NailStyleStudio sampledShade={sampledShade} active={tab === "style"} /></div>
          <div hidden={tab !== "care"}><GuidedCare /></div>
          <div hidden={tab !== "search"}><section className="panel nyxi-knowledge-panel" aria-labelledby="search-title">
            <span className="overline">04 / THE KNOWLEDGE EDIT</span>
            <h2 id="search-title">Η ομορφιά<br /><em>έχει και γνώση.</em></h2>
            <p className="muted search-intro">Ανακάλυψε τις πηγές πίσω από την περιποίηση και τα συστατικά. Εμφανίζουμε μόνο στοιχεία με ανεξάρτητα εγκεκριμένη τεκμηρίωση.</p>
            {searchEnabled ? <>
              <form className="searchform" onSubmit={submit}>
                <label htmlFor="query" className="sr-only">Όρος αναζήτησης</label>
                <input id="query" value={q} maxLength={100} disabled={busy} onChange={e => setQ(e.target.value)} placeholder="Αναζήτησε συστατικά, φροντίδα, προϊόντα…" />
                <button type="submit" disabled={busy || !q.trim()}>{busy ? "Αναζήτηση…" : "Ανακάλυψε"} <span aria-hidden="true">↗</span></button>
              </form>
              <div className="results" aria-live="polite" aria-busy={busy}>
                {busy && <p className="notice">Γίνεται αναζήτηση στις εγκεκριμένες πηγές…</p>}
                {data.error && <p className="notice warning" role="alert">{data.error}</p>}
                {data.status === "no_approved_evidence" && <p className="notice">Η βιβλιοθήκη βρίσκεται υπό έλεγχο. Δεν υπάρχουν ακόμη εγκεκριμένα στοιχεία προς δημοσίευση.</p>}
                {data.status === "no_matches" && <p className="notice">Δεν βρέθηκαν εγκεκριμένα αποτελέσματα.</p>}
                {data.results?.map(x => <article className="result" key={x.id}><div className="resultmeta">{x.authority || "Πρωτογενής πηγή"}{x.category ? " · " + x.category : ""}</div><p>{x.excerpt}</p><a href={x.citation_url} target="_blank" rel="noopener noreferrer">Δες την πηγή <span aria-hidden="true">↗</span></a></article>)}
              </div>
            </> : <div className="research-holding" role="status"><div className="holding-mark" aria-hidden="true">✧</div><span className="overline">QUALITY FIRST</span><h3>Η βιβλιοθήκη προετοιμάζεται με προσοχή.</h3><p>Ελέγχουμε κάθε πηγή ανεξάρτητα πριν εμφανιστεί εδώ. Στο μεταξύ, εξερεύνησε το Color Studio, σχεδίασε το μανικιούρ σου ή δες τον οδηγό ήπιας φροντίδας.</p><button type="button" className="primary-action" onClick={() => setTab("care")}>Εξερεύνησε το Nail Care <span aria-hidden="true">↗</span></button></div>}
            <PublicSourceAtlas active={tab === "search"} />
            <p className="source-note">Η NYXI δεν δημοσιεύει ανεπιβεβαίωτα ευρήματα. Το περιεχόμενο προστίθεται σταδιακά μετά από έλεγχο.</p>
          </section></div>
        </div>
      </div>
    </section>
    <section className="nyxi-endnote" aria-label="NYXI">
      <span>NYXI / THE STUDIO</span>
      <p>Different shades.<br /><em>Different stories.</em></p>
      <a href="#nyxi-tools">KEEP EXPLORING <span aria-hidden="true">↗</span></a>
    </section>
    <footer className="nyxi-footer"><div><a className="footer-brand" href="/">NYXI<span className="dot">.</span></a><p className="footer-signoff">Color is a little personal.</p><p>Η δική σου εμπειρία νυχιών.</p></div><div className="footer-meta"><span>Ερευνητική έκδοση · BETA</span><span>Οι πληροφορίες δεν αντικαθιστούν επαγγελματική συμβουλή.</span></div></footer>
  </main>;
}

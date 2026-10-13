"use client";

import { useEffect, useMemo, useState } from "react";

type Source = { key: string; title: string; authority: string; url: string };
type Reply = { status?: string; sources?: Source[]; count?: number; error?: string };

export default function PublicSourceAtlas({ active }: { active: boolean }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!active || state !== "idle") return;
    const controller = new AbortController();
    setState("loading");
    (async () => {
      try {
        const response = await fetch("/api/sources", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("atlas_unavailable");
        const data = await response.json() as Reply;
        if (data.status !== "ok" || !Array.isArray(data.sources)) throw new Error("invalid_atlas");
        setSources(data.sources);
        setState("ready");
      } catch (error) {
        if (!controller.signal.aborted) setState("unavailable");
      }
    })();
    return () => controller.abort();
  }, [active, state]);

  const filtered = useMemo(() => sources.filter(source =>
    (source.title + " " + source.authority).toLocaleLowerCase("el").includes(filter.trim().toLocaleLowerCase("el"))
  ), [filter, sources]);

  return <section className="nyxi-source-atlas" aria-labelledby="source-atlas-title">
    <div className="atlas-title-row">
      <div><span className="overline">SOURCE ATLAS / OFFICIAL REFERENCES</span>
        <h3 id="source-atlas-title">Οι πηγές που συμβουλευόμαστε.</h3>
        <p>Εδώ βρίσκεις συνδέσμους προς ενεργές εξωτερικές πηγές της NYXI. Η καταχώριση μιας πηγής <strong>δεν σημαίνει</strong> ότι το περιεχόμενό της έχει εγκριθεί για δημοσίευση ως συμβουλή.</p>
      </div>
      {state === "ready" && <span className="atlas-number" aria-label={sources.length + " ενεργές πηγές"}>{sources.length}<small>ΕΝΕΡΓΕΣ ΠΗΓΕΣ</small></span>}
    </div>
    {state === "loading" && <p className="notice" role="status">Φόρτωση ενεργών πηγών…</p>}
    {state === "unavailable" && <div className="notice warning" role="alert">Η λίστα πηγών δεν είναι διαθέσιμη αυτή τη στιγμή. <button type="button" className="atlas-retry" onClick={() => setState("idle")}>Δοκίμασε ξανά</button></div>}
    {state === "ready" && <>
      <label htmlFor="nyxi-atlas-filter" className="sr-only">Φίλτρο πηγών</label>
      <input id="nyxi-atlas-filter" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Αναζήτησε φορέα ή πηγή…" className="atlas-filter" />
      {sources.length === 0 ? <p className="notice">Δεν έχουν ενεργοποιηθεί δημόσιες πηγές.</p> :
        <div className="atlas-source-list">
          {filtered.map(source => <a className="atlas-source" key={source.key} href={source.url} target="_blank" rel="noreferrer noopener">
            <span className="atlas-source-icon" aria-hidden="true">↗</span><span><strong>{source.title}</strong><small>{source.authority}</small></span>
          </a>)}
        </div>}
      {sources.length !== 0 && filtered.length === 0 && <p className="notice">Δεν βρέθηκαν πηγές για αυτό το φίλτρο.</p>}
      <p className="atlas-caveat">Οι σύνδεσμοι οδηγούν στους αρχικούς εκδότες. Το περιεχόμενο μπορεί να διαφέρει ανά χώρα και να έχει ενημερωθεί από τον εκδότη. Οι ανεξάρτητα εγκεκριμένες απαντήσεις θα εμφανίζονται στην αναζήτηση μόλις ολοκληρωθεί ο έλεγχος.</p>
    </>}
  </section>;
}

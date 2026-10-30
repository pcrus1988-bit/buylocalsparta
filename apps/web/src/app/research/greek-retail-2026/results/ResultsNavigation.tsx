"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PUBLIC_RESULTS_CHAPTERS } from "../../../../lib/research-public-results-sections";
import styles from "./ResultsNavigation.module.css";

const sections = [
  { id: "results-map", number: "01", title: "Χάρτης Ελλάδας" },
  { id: "results-science", number: "02", title: "Βασικά διαγράμματα" },
  { id: "research-workbench", number: "03", title: "Interactive Explorer" },
  { id: "results-data-request", number: "04", title: "Πρόσβαση σε δεδομένα" }
] as const;

export function ResultsNavigation() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("results-map");

  useEffect(() => {
    const nodes = sections.map(section => document.getElementById(section.id)).filter((node): node is HTMLElement => Boolean(node));
    if (typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setCurrent(visible[0].target.id);
    }, { rootMargin: "-12% 0px -58% 0px", threshold: 0 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const go = (section: string, chapter?: string) => {
    setCurrent(section);
    setOpen(false);
    if (chapter) window.dispatchEvent(new CustomEvent("research:select-chapter", { detail: chapter }));
  };

  return <>
    <button type="button" className={styles.mobileToggle} aria-controls="research-results-sidebar"
      aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">☰</span> Πλοήγηση στα αποτελέσματα <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <button type="button" className={styles.backdrop} aria-label="Κλείσιμο πλοήγησης" onClick={() => setOpen(false)} />}
    <aside id="research-results-sidebar" aria-label="Γρήγορη πλοήγηση στα αποτελέσματα"
      className={styles.sidebar + (open ? " " + styles.sidebarOpen : "")}>
      <div className={styles.brand}>
        <div><span className={styles.brandMark}>K<span>O</span>NTA MOY</span>
          <strong>Αποτελέσματα έρευνας</strong><small>Ελληνικό Λιανεμπόριο · 2026</small></div>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Κλείσιμο μενού">×</button>
      </div>
      <span className={styles.groupLabel}>ΠΕΡΙΕΧΟΜΕΝΑ</span>
      <nav className={styles.nav} aria-label="Ενότητες σελίδας αποτελεσμάτων">
        {sections.slice(0, 3).map(section => <a key={section.id} href={`#${section.id}`}
          aria-current={current === section.id ? "location" : undefined}
          className={current === section.id ? styles.active : styles.navLink}
          onClick={() => go(section.id)}>
          <span className={styles.navNumber}>{section.number}</span>{section.title}
        </a>)}
        <span className={styles.subLabel}>6 ΘΕΜΑΤΙΚΕΣ · ΕΞΕΡΕΥΝΗΣΗ</span>
        <div className={styles.chapters}>
          {PUBLIC_RESULTS_CHAPTERS.map(chapter => <a key={chapter.id} href="#research-workbench"
            onClick={() => go("research-workbench", chapter.id)}>
            <span>{chapter.number}</span>{chapter.name}
          </a>)}
        </div>
        <a href="#results-data-request" className={current === "results-data-request" ? styles.active : styles.navLink}
          onClick={() => go("results-data-request")}>
          <span className={styles.navNumber}>04</span>Πρόσβαση σε δεδομένα
        </a>
      </nav>
      <div className={styles.divider} />
      <span className={styles.groupLabel}>ΣΧΕΤΙΚΕΣ ΣΕΛΙΔΕΣ</span>
      <nav className={styles.nav} aria-label="Σχετικές σελίδες έρευνας">
        <Link href="/research/greek-retail-2026/results/voices" onClick={() => setOpen(false)} className={styles.related}>Η φωνή της Ελλάδας <span aria-hidden="true">↗</span></Link>
        <Link href="/research/greek-retail-2026/methodology" onClick={() => setOpen(false)} className={styles.related}>Πλήρης μεθοδολογία <span aria-hidden="true">↗</span></Link>
        <Link href="/research/greek-retail-2026" onClick={() => setOpen(false)} className={styles.related}>Επισκόπηση μελέτης <span aria-hidden="true">↗</span></Link>
      </nav>
      <div className={styles.bottom}>KONTA MOY RESEARCH <span>·</span> ΔΗΜΟΣΙΕΥΜΕΝΗ ΜΕΛΕΤΗ</div>
    </aside>
  </>;
}

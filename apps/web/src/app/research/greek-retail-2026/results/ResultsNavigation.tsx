"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PUBLIC_RESULTS_CHAPTERS } from "../../../../lib/research-public-results-sections";
import { RESULTS_EXPLORER_VIEWS, readResultsExplorerHash, resultsExplorerAnchor, type ResultsExplorerView } from "./ResultsExplorerViews";
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
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<ResultsExplorerView>("chapters");
  const [chaptersExpanded, setChaptersExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

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
    const initialView = readResultsExplorerHash(window.location.hash);
    if (initialView) {
      setSelectedView(initialView);
      setCurrent("research-workbench");
    }
    const updateView = (event: Event) => {
      const view = (event as CustomEvent<ResultsExplorerView>).detail;
      if (RESULTS_EXPLORER_VIEWS.some(item => item.id === view)) setSelectedView(view);
    };
    window.addEventListener("research:workbench-tab-changed", updateView);
    return () => window.removeEventListener("research:workbench-tab-changed", updateView);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus stays inside the mobile navigation and returns to its toggle on Escape.
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLButtonElement>('button[aria-label="Κλείσιμο μενού"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusables = [...drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
        .filter(element => element.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const go = (section: string, chapter?: string, view?: ResultsExplorerView) => {
    setCurrent(section);
    setOpen(false);
    if (view) {
      setSelectedView(view);
      window.dispatchEvent(new CustomEvent("research:select-workbench-tab", { detail: view }));
    }
    if (chapter) {
      setSelectedChapter(chapter);
      window.dispatchEvent(new CustomEvent("research:select-chapter", { detail: chapter }));
    }
  };

  return <>
    <button ref={toggleRef} type="button" className={styles.mobileToggle} aria-controls="research-results-sidebar"
      aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">☰</span> Ενότητες αποτελεσμάτων <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <button type="button" className={styles.backdrop} aria-label="Κλείσιμο πλοήγησης" onClick={dismiss} />}
    <aside ref={drawerRef} id="research-results-sidebar" role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label="Γρήγορη πλοήγηση στα αποτελέσματα"
      className={styles.sidebar + (open ? " " + styles.sidebarOpen : "")}>
      <div className={styles.brand}>
        <div><span className={styles.brandMark}>K<span>O</span>NTA MOY</span>
          <strong>Αποτελέσματα έρευνας</strong><small>Ελληνικό Λιανεμπόριο · 2026</small></div>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Κλείσιμο μενού">×</button>
      </div>
      <span className={styles.groupLabel}>ΠΕΡΙΕΧΟΜΕΝΑ</span>
      <nav className={styles.nav} aria-label="Ενότητες σελίδας αποτελεσμάτων">
        {sections.slice(0, 2).map(section => <a key={section.id} href={`#${section.id}`}
          aria-current={current === section.id ? "location" : undefined}
          className={current === section.id ? styles.active : styles.navLink}
          onClick={() => go(section.id)}>
          <span className={styles.navNumber}>{section.number}</span>{section.title}
        </a>)}
        <span className={styles.subLabel}>03 · ΔΙΑΔΡΑΣΤΙΚΗ ΕΞΕΡΕΥΝΗΣΗ</span>
        <div className={styles.explorerLinks}>
          {RESULTS_EXPLORER_VIEWS.map(view => <div key={view.id} className={styles.explorerEntry}>
            <a href={`#${resultsExplorerAnchor(view.id)}`}
              aria-current={current === "research-workbench" && selectedView === view.id ? "location" : undefined}
              className={current === "research-workbench" && selectedView === view.id ? styles.explorerActive : styles.explorerLink}
              onClick={() => go("research-workbench", undefined, view.id)}>
              <span className={styles.explorerNumber}>{view.number}</span>{view.nav}
            </a>
            {view.id === "chapters" && <>
              <button type="button" className={styles.chapterToggle} aria-expanded={chaptersExpanded}
                aria-controls="research-results-chapters" onClick={() => setChaptersExpanded(value => !value)}>
                6 θεματικές ενότητες <span aria-hidden="true">{chaptersExpanded ? "−" : "+"}</span>
              </button>
              {chaptersExpanded && <div id="research-results-chapters" className={styles.chapters}>
                {PUBLIC_RESULTS_CHAPTERS.map(chapter => <a key={chapter.id} href={`#${resultsExplorerAnchor("chapters")}`}
                  className={selectedChapter === chapter.id ? styles.chapterSelected : undefined}
                  aria-current={selectedChapter === chapter.id ? "location" : undefined}
                  onClick={() => go("research-workbench", chapter.id, "chapters")}>
                  <span>{chapter.number}</span>{chapter.name}
                </a>)}
              </div>}
            </>}
          </div>)}
        </div>
        <a href="#results-data-request" className={current === "results-data-request" ? styles.active : styles.navLink}
          onClick={() => go("results-data-request")}>
          <span className={styles.navNumber}>04</span>Πρόσβαση σε δεδομένα
        </a>
      </nav>
      <div className={styles.divider} />
      <span className={styles.groupLabel}>ΣΧΕΤΙΚΕΣ ΣΕΛΙΔΕΣ</span>
      <nav className={styles.nav} aria-label="Σχετικές σελίδες έρευνας">
        <Link href="/research/greek-retail-2026/results/voices" onClick={() => setOpen(false)} className={styles.related}>Η φωνή της Ελλάδας · πλήρης σελίδα <span aria-hidden="true">↗</span></Link>
        <Link href="/research/greek-retail-2026/methodology" onClick={() => setOpen(false)} className={styles.related}>Πλήρης μεθοδολογία <span aria-hidden="true">↗</span></Link>
        <Link href="/research/greek-retail-2026" onClick={() => setOpen(false)} className={styles.related}>Επισκόπηση μελέτης <span aria-hidden="true">↗</span></Link>
      </nav>
      <div className={styles.bottom}>KONTA MOY RESEARCH <span>·</span> ΔΗΜΟΣΙΕΥΜΕΝΗ ΜΕΛΕΤΗ</div>
    </aside>
  </>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./MethodologyNavigation.module.css";

const groups = [
  { heading: "Σχεδιασμός", items: [
    { id: "purpose", label: "Σκοπός της μελέτης" },
    { id: "population", label: "Πληθυσμός & πηγές" },
    { id: "cohorts", label: "Ομάδες Α και Β" }
  ] },
  { heading: "Διεξαγωγή", items: [
    { id: "phases", label: "Στάδια διεξαγωγής" },
    { id: "fieldwork-audit", label: "Τελικός απολογισμός" },
    { id: "questionnaire", label: "Ερωτηματολόγιο" },
    { id: "quality", label: "Έλεγχοι ποιότητας" }
  ] },
  { heading: "Ανάλυση & διαφάνεια", items: [
    { id: "analysis", label: "Δείκτες & στάθμιση" },
    { id: "limitations", label: "Όρια ερμηνείας" },
    { id: "privacy", label: "Προστασία δεδομένων" },
    { id: "publication", label: "Δημοσίευση & αρχεία" },
    { id: "faq", label: "Συχνές ερωτήσεις" }
  ] }
] as const;
const flatSections = groups.flatMap(group => group.items);

export function MethodologyNavigation() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("purpose");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sections = flatSections
      .map(section => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    let raf = 0;
    const update = () => {
      raf = 0;
      const scrolled = sections.filter(section => section.getBoundingClientRect().top <= 220);
      if (scrolled.length) setActive(scrolled[scrolled.length - 1]!.id);
      else if (sections[0]) setActive(sections[0].id);
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = asideRef.current;
    dialog?.querySelector<HTMLButtonElement>('button[aria-label="Κλείσιμο πλοήγησης"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const select = (id: string) => { setActive(id); setOpen(false); };

  return <>
    <button type="button" ref={triggerRef} className={styles.mobileButton}
      aria-controls="retail-methodology-sidebar" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">☰</span> Πλοήγηση στη μεθοδολογία <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <button type="button" className={styles.backdrop} aria-label="Κλείσιμο πλοήγησης" onClick={close} />}
    <aside ref={asideRef} id="retail-methodology-sidebar" className={styles.sidebar + (open ? " " + styles.open : "")}
      role={open ? "dialog" : undefined} aria-modal={open ? true : undefined}
      aria-label="Γρήγορη πλοήγηση στη μεθοδολογία">
      <div className={styles.brand}>
        <div>
          <span className={styles.brandEyebrow}>KONTA MOY RESEARCH</span>
          <strong>Μεθοδολογία</strong>
          <small>Ελληνικό Λιανεμπόριο · 2026</small>
        </div>
        <button type="button" className={styles.close} aria-label="Κλείσιμο πλοήγησης" onClick={close}>×</button>
      </div>
      <nav className={styles.nav} aria-label="Κεφάλαια μεθοδολογίας">
        {groups.map((group, groupIndex) => <div className={styles.group} key={group.heading}>
          <span className={styles.groupLabel}>{String(groupIndex + 1).padStart(2, "0")} · {group.heading}</span>
          {group.items.map(item => <a key={item.id} href={`#${item.id}`}
            className={active === item.id ? styles.selected : styles.item}
            aria-current={active === item.id ? "location" : undefined} onClick={() => select(item.id)}>
            {item.label}
          </a>)}
        </div>)}
      </nav>
      <div className={styles.related}>
        <strong>Συνεχίστε την ανάγνωση</strong>
        <Link href="/research/greek-retail-2026/results" onClick={() => setOpen(false)}>Δημοσιευμένα αποτελέσματα <span aria-hidden="true">↗</span></Link>
        <Link href="/research/greek-retail-2026/results/voices" onClick={() => setOpen(false)}>Η φωνή της Ελλάδας <span aria-hidden="true">↗</span></Link>
        <Link href="/research/privacy" onClick={() => setOpen(false)}>Πολιτική ιδιωτικότητας <span aria-hidden="true">↗</span></Link>
      </div>
    </aside>
  </>;
}

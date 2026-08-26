"use client";

import { useState } from "react";
import styles from "./DeliveryOperations.module.css";

const sections = [
  { href: "#dm-overview", short: "Σύνοψη", label: "Σύνοψη λειτουργίας" },
  { href: "#dm-map", short: "Χάρτης", label: "Live χάρτης" },
  { href: "#dm-fleet", short: "Στόλος", label: "Στόλος & fairness" },
  { href: "#dm-reports", short: "Reports", label: "Στατιστικά & PDF" },
] as const;

const moreSections = [
  { href: "#dm-alerts", label: "Red Mode & εγκρίσεις" },
  { href: "#dm-forecast", label: "Forecast / Next Best Action" },
  { href: "#dm-decisions", label: "Αποφάσεις dispatcher" },
] as const;

function goTo(href: string) {
  const node = document.querySelector(href);
  if (node instanceof HTMLElement) node.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DeliveryManagerNavigation() {
  const [open, setOpen] = useState(false);

  function refreshAll() {
    window.dispatchEvent(new Event("delivery-manager-refresh"));
  }

  return <>
    <div className={styles.managerAppBar}>
      <button className={styles.managerMenuButton} type="button" aria-label="Άνοιγμα μενού Delivery Manager" onClick={() => setOpen(true)}>
        <span aria-hidden="true">☰</span>
      </button>
      <div className={styles.managerAppIdentity}>
        <span className={styles.managerAppKicker}>KONTA MOY</span>
        <strong>Delivery Manager</strong>
      </div>
      <nav className={styles.managerDesktopNav} aria-label="Delivery Manager sections">
        {sections.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        {moreSections.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
      </nav>
      <button className={styles.managerRefreshButton} type="button" onClick={refreshAll} aria-label="Ανανέωση δεδομένων">↻ <span>Refresh</span></button>
    </div>

    <div className={styles.managerFloatingActions} aria-label="Γρήγορες ενέργειες">
      <button type="button" onClick={refreshAll} title="Ανανέωση δεδομένων" aria-label="Ανανέωση δεδομένων">↻</button>
      <button type="button" onClick={() => goTo("#dm-reports")} title="PDF Reports" aria-label="Μετάβαση στα PDF reports">PDF</button>
      <button type="button" onClick={() => goTo("#dm-overview")} title="Πάνω" aria-label="Μετάβαση στη σύνοψη">↑</button>
    </div>

    <nav className={styles.managerBottomNav} aria-label="Κύρια πλοήγηση Delivery Manager">
      {sections.map((item) => <a key={item.href} href={item.href}><span>{item.short === "Σύνοψη" ? "⌂" : item.short === "Χάρτης" ? "◎" : item.short === "Στόλος" ? "◉" : "▤"}</span><small>{item.short}</small></a>)}
      <button type="button" onClick={() => setOpen(true)}><span>☰</span><small>Μενού</small></button>
    </nav>

    {open && <div className={styles.managerDrawerBackdrop} role="presentation" onClick={() => setOpen(false)}>
      <aside className={styles.managerDrawer} role="dialog" aria-modal="true" aria-label="Μενού Delivery Manager" onClick={(event) => event.stopPropagation()}>
        <div className={styles.managerDrawerHeader}>
          <div><span className={styles.managerAppKicker}>KONTA MOY</span><h2>Delivery Manager</h2></div>
          <button type="button" aria-label="Κλείσιμο μενού" onClick={() => setOpen(false)}>×</button>
        </div>
        <p className={styles.muted}>Γρήγορη πρόσβαση στις λειτουργίες του στόλου χωρίς να χρειάζεται συνεχές scrolling.</p>
        <div className={styles.managerDrawerLinks}>
          {[...sections, ...moreSections].map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}<span>›</span></a>)}
        </div>
        <button className={styles.button} type="button" onClick={() => { refreshAll(); setOpen(false); }}>↻ Ανανέωση όλων των δεδομένων</button>
      </aside>
    </div>}
  </>;
}

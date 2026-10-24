"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./Preview.module.css";
import { ResearchResultsWorkbench } from "../ResearchResultsWorkbench";
import type { LiveGreekRetailPreview } from "../../../../../lib/research-live-preview-data";
import type { SafeParticipationGeography } from "../../../../../lib/research-public-results-data";

const LIVE_URL = "/api/research/greek-retail-2026/results-preview-live";
const REFRESH_MS = 60_000;

export function ResearchResultsPreviewExperience({initial,geography}:{initial:LiveGreekRetailPreview|null;geography?:SafeParticipationGeography}) {
  const [snapshot,setSnapshot] = useState<LiveGreekRetailPreview|null>(initial);
  const [error,setError] = useState(!initial);
  const [refreshing,setRefreshing] = useState(false);

  const refresh = useCallback(async (signal?:AbortSignal) => {
    setRefreshing(true);
    try {
      const res = await fetch(LIVE_URL,{cache:"no-store",credentials:"same-origin",signal});
      if (!res.ok) throw new Error("LIVE_PREVIEW_UNAVAILABLE");
      const data: LiveGreekRetailPreview & {schema:string} = await res.json();
      if (data.schema!=="kontamou.research.live-preview.v1"
          || !Array.isArray(data.points) || !Number.isSafeInteger(data.includedResponses)) {
        throw new Error("LIVE_PREVIEW_INVALID");
      }
      setSnapshot(data); setError(false);
    } catch (cause) {
      if (!signal?.aborted) {
        setError(true);
        // Never show stale counts as if they were live.
        setSnapshot(null);
      }
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  },[]);

  useEffect(()=>{
    const controller = new AbortController();
    const timer = window.setInterval(()=>{ void refresh(controller.signal); },REFRESH_MS);
    return ()=>{ window.clearInterval(timer); controller.abort(); };
  },[refresh]);

  return <div className={styles.content}>
    <section className={styles.hero}>
      <div className={styles.heroText}>
        <div className={styles.superline}><span className={styles.dot}/> KONTA MOY RESEARCH <span className={styles.separator}>/</span> ΕΛΛΗΝΙΚΟ ΛΙΑΝΕΜΠΟΡΙΟ 2026</div>
        <div className={styles.chip}>LIVE · ΠΡΑΓΜΑΤΙΚΕΣ ΑΠΑΝΤΗΣΕΙΣ · ΜΟΝΟ ΓΙΑ ΕΣΩΤΕΡΙΚΗ ΧΡΗΣΗ</div>
        <h1>Πίσω από τους αριθμούς, <em>η πραγματικότητα της αγοράς.</em></h1>
        <p>Η προεπισκόπηση ενημερώνεται με συγκεντρωτικά δεδομένα από ολοκληρωμένα και ήδη εγκεκριμένα στον ποιοτικό έλεγχο ερωτηματολόγια. Οι τιμές είναι προκαταρκτικές, μη σταθμισμένες και δεν αποτελούν τελική επιστημονική έκθεση.</p>
        <div className={styles.heroActions}>
          <a className={styles.primaryAction} href="#research-workbench">Εξερεύνηση ευρημάτων ↗</a>
          <Link href="/research/greek-retail-2026/results" className={styles.secondaryAction}>Δημόσια σελίδα αποτελεσμάτων</Link>
        </div>
      </div>
      <div className={styles.heroGraphic}>
        <div className={styles.paperTop}><span>RESEARCH / 2026</span><span>LIVE SNAPSHOT</span></div>
        <div className={styles.paperTitle}>Ποιοτικά εγκεκριμένες συμμετοχές</div>
        <div style={{fontSize:"3rem",fontWeight:800,marginBlock:"1rem"}}>{snapshot ? snapshot.includedResponses.toLocaleString("el-GR") : "—"}</div>
        <p>Ολοκληρωμένες απαντήσεις με τελευταίο έλεγχο «include». Οι υπό έλεγχο, απορριφθείσες, μη ολοκληρωμένες και αποσυρμένες αποκλείονται.</p>
        <div className={styles.heroPaperFooter}>
          {snapshot
            ? "Τελευταία ενημέρωση: "+new Date(snapshot.capturedAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"medium"})+" (Ελλάδα)"
            : "Δεν υπάρχει διαθέσιμη ζωντανή σύνδεση"}
        </div>
      </div>
    </section>

    <div className={styles.demoRibbon} role="note">
      <strong>ΠΡΟΚΑΤΑΡΚΤΙΚΑ · ΜΗ ΣΤΑΘΜΙΣΜΕΝΑ ΔΕΔΟΜΕΝΑ</strong>
      <span>Πραγματικές συγκεντρωτικές απαντήσεις, όχι δεδομένα επίδειξης. Καμία υποομάδα με n κάτω από 30 δεν εμφανίζεται. Τα διαστήματα εμπιστοσύνης, η στάθμιση και οι τελικές ερμηνείες θα προκύψουν μόνο από την εγκεκριμένη ανάλυση. Η επίσημη δημοσίευση παραμένει προγραμματισμένη για 1 Νοεμβρίου 2026, 00:00:01 ώρα Ελλάδας.</span>
      <button type="button" disabled={refreshing} onClick={()=>{void refresh();}} style={{marginTop:10}}>
        {refreshing?"Ανανέωση…":"Ανανέωση δεδομένων τώρα"}
      </button>
    </div>
    {error && <p role="alert" style={{padding:16}}>Η ζωντανή ανάκτηση απέτυχε. Δεν εμφανίζονται αποθηκευμένα ή υποθετικά αποτελέσματα. Δοκιμάστε ξανά την ανανέωση.</p>}
    <ResearchResultsWorkbench mode="live" points={snapshot?.points??[]} geography={geography} />
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import { HUB_EXPANSION_PLANS } from "../lib/hub-expansion-plans";
import styles from "../app/hubs/join/page.module.css";

const STORAGE_KEY = "kontamou:research-onboarding-reward";
const eur = (cents: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

export function HubJoinRewardComparison({ featureRows }: {
  featureRows: readonly { label: string; plans: readonly string[] }[];
}) {
  const [code, setCode] = useState("");
  const [discountValid, setDiscountValid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function verify(candidate: string) {
    if (!candidate.trim()) return;
    setChecking(true);
    setDiscountValid(false);
    setError("");
    try {
      const response = await fetch("/api/hub-research-reward", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: candidate.trim(), planCode: "shop" })
      });
      const data = await response.json() as { valid?: boolean; error?: string };
      if (!response.ok || !data.valid) throw new Error(data.error ?? "Ο κωδικός δεν είναι έγκυρος.");
      setCode(candidate.trim().toUpperCase());
      setDiscountValid(true);
      sessionStorage.setItem(STORAGE_KEY, candidate.trim().toUpperCase());
    } catch (cause) {
      sessionStorage.removeItem(STORAGE_KEY);
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η επαλήθευση.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) { setCode(stored); void verify(stored); }
  }, []);

  return <>
    <div className={styles.rewardBox} id="reward-code">
      <div>
        <strong>Συμμετείχες στην έρευνα λιανεμπορίου;</strong>
        <p>Πληκτρολόγησε τον προσωπικό κωδικό ευχαριστίας για 50% έκπτωση μόνο στο εφάπαξ κόστος ένταξης.</p>
      </div>
      <form className={styles.rewardForm} onSubmit={(event) => { event.preventDefault(); void verify(code); }}>
        <label className={styles.srOnly} htmlFor="research-onboarding-reward">Κωδικός επιβράβευσης</label>
        <input id="research-onboarding-reward" autoComplete="off" value={code} maxLength={19}
          placeholder="KM26-XXXX-XXXX-XXXX"
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setDiscountValid(false); setError(""); sessionStorage.removeItem(STORAGE_KEY); }} />
        <button className="button" type="submit" disabled={checking || !code.trim()}>{checking ? "Έλεγχος…" : "Εφαρμογή κωδικού"}</button>
      </form>
      {error && <p role="alert" className={styles.rewardError}>{error}</p>}
      {discountValid && <p role="status" className={styles.rewardSuccess}>✓ Έγκυρος κωδικός — οι τιμές ένταξης παρακάτω περιλαμβάνουν την έκπτωση 50%. Ο κωδικός θα εξαργυρωθεί μόνο μετά την υποβολή της αίτησης.</p>}
    </div>
        <div className={styles.tableWrap} tabIndex={0} aria-label="Οριζόντια σύγκριση προγραμμάτων">
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th scope="col">Περιλαμβάνει</th>
                {HUB_EXPANSION_PLANS.map((plan) => <th scope="col" className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                  <span>{plan.eyebrow}</span>
                  <strong>{plan.name}</strong>
                  {plan.featured && <b>Marketplace</b>}
                </th>)}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.priceRow}><th scope="row">Ένταξη</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{discountValid && plan.setupFeeCents > 0
                    ? <><s className={styles.originalFee}>{plan.setupLabel}</s><br /><span className={styles.discountPrice}>{eur(plan.setupFeeCents / 2)}</span></>
                    : plan.setupLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Μηνιαία</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.monthlyLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Ετήσια</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.annualLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Προμήθεια</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.commissionLabel}</strong></td>)}</tr>
              {featureRows.map((row) => <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {HUB_EXPANSION_PLANS.map((plan) => {
                  const included = (row.plans as readonly string[]).includes(plan.code);
                  return <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                    <span className={included ? styles.check : styles.dash} aria-hidden="true">{included ? "✓" : "—"}</span>
                    <span className={styles.srOnly}>{included ? "Περιλαμβάνεται" : "Δεν περιλαμβάνεται"}</span>
                  </td>;
                })}
              </tr>)}
              <tr className={styles.actionRow}>
                <th scope="row"><span className={styles.srOnly}>Επιλογή προγράμματος</span></th>
                {HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                  <a className={`button ${styles.planButton}`} href={`/hubs/join/apply?plan=${plan.code}&billing=annual#application-form`}>{plan.code === "claim" ? "Δωρεάν CLAIM" : `Επίλεξε ${plan.name}`}</a>
                </td>)}
              </tr>
            </tbody>
          </table>
        </div>

  </>;
}

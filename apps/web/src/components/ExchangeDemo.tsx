"use client";

import { useState } from "react";
import {
  freshExchangeDemoDrinks,
  simulateExchangeDemand,
} from "../lib/exchange-demo-pricing";
import styles from "../app/hospitality/drinkStock/drinkStock.module.css";

const euros = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function ExchangeDemo() {
  const [drinks, setDrinks] = useState(freshExchangeDemoDrinks);
  const [events, setEvents] = useState(0);
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  function simulate(id: string) {
    setDrinks((previous) => simulateExchangeDemand(previous, id));
    setEvents((previous) => previous + 1);
    setLastSelected(id);
  }

  function reset() {
    setDrinks(freshExchangeDemoDrinks());
    setEvents(0);
    setLastSelected(null);
  }

  const chosen = drinks.find((drink) => drink.id === lastSelected);

  return (
    <section className={styles.demoSection} id="demo" aria-labelledby="exchange-demo-title">
      <div className={styles.demoIntro}>
        <div>
          <span className={styles.eyebrow}>INTERACTIVE DEMO</span>
          <h2 id="exchange-demo-title">Η τιμή κινείται μαζί με τη ζήτηση.</h2>
          <p>Επίλεξε ένα ποτό για να δεις πώς μπορεί να αντιδρά μια ελεγχόμενη αγορά τιμών.</p>
        </div>
        <div className={styles.demoState} aria-live="polite">
          <span className={styles.demoLamp} aria-hidden="true" />
          {events === 0 ? "Έτοιμο για δοκιμή" : String(events) + " κινήσεις προσομοίωσης"}
        </div>
      </div>
      <div className={styles.demoPanel}>
        <div className={styles.demoTopline}>
          <div>
            <span className={styles.demoOverline}>KONTA MOY EXCHANGE</span>
            <strong>LIVE MARKET <span className={styles.demoTag}>SIMULATION</span></strong>
          </div>
          <button type="button" className={styles.resetButton} onClick={reset}>
            ↺ Επαναφορά
          </button>
        </div>
        <div className={styles.drinkGrid}>
          {drinks.map((drink) => (
            <div key={drink.id} className={styles.drinkCard}>
              <div className={styles.drinkHead}>
                <span className={styles.drinkName}>{drink.name}</span>
                <span className={styles.drinkDescription}>{drink.description}</span>
              </div>
              <div className={styles.priceLine}>
                <strong>{euros.format(drink.priceCents / 100)}</strong>
                <span
                  className={[
                    styles.change,
                    drink.lastDeltaCents > 0
                      ? styles.rise
                      : drink.lastDeltaCents < 0
                        ? styles.fall
                        : styles.flat,
                  ].join(" ")}
                >
                  {drink.lastDeltaCents > 0 ? "↑ " : drink.lastDeltaCents < 0 ? "↓ " : "→ "}
                  {euros.format(Math.abs(drink.lastDeltaCents) / 100)}
                </span>
              </div>
              <button
                type="button"
                className={styles.tradeButton}
                onClick={() => simulate(drink.id)}
                aria-label={"Προσομοίωση ζήτησης για " + drink.name}
              >
                Αύξηση ζήτησης <span aria-hidden="true">↗</span>
              </button>
            </div>
          ))}
        </div>
        <div className={styles.demoFooter}>
          <p aria-live="polite">
            {chosen
              ? "Τελευταία επιλογή: " + chosen.name + ". Οι τιμές αναπροσαρμόστηκαν εντός προκαθορισμένων ορίων."
              : "Οι τιμές εκκινούν από ενδεικτικές τιμές καταλόγου."}
          </p>
          <span>DEMO ONLY · ΧΩΡΙΣ ΠΑΡΑΓΓΕΛΙΕΣ Ή ΠΛΗΡΩΜΕΣ</span>
        </div>
      </div>
      <p className={styles.demoDisclaimer}>
        Πρόκειται αποκλειστικά για τοπική, ενδεικτική προσομοίωση. Δεν συνδέεται με πραγματικό κατάστημα, απόθεμα, POS ή συναλλαγές.
      </p>
    </section>
  );
}